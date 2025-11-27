import { WorkFlowy, Client } from 'workflowy';

class WorkflowyClient {
    /**
     * Create authenticated Workflowy client instance
     * @private Helper method to create and authenticate a Workflowy client
     */
    private async createAuthenticatedClient(username?: string, password?: string): Promise<{wf: WorkFlowy, client: Client}> {
        // Use parameters if provided, otherwise fall back to config
        const loginUsername = username || process.env.WORKFLOWY_USERNAME;
        const loginPassword = password || process.env.WORKFLOWY_PASSWORD;

        if (!loginUsername || !loginPassword) {
            throw new Error('Workflowy credentials not provided. Please set WORKFLOWY_USERNAME and WORKFLOWY_PASSWORD environment variables.');
        }

        // Create a new Workflowy client instance
        const wf = new WorkFlowy(loginUsername, loginPassword);
        const client = wf.getClient();
        const ok = await client.login();

        if (!ok.success) {
            throw new Error('Workflowy authentication failed. Please provide valid credentials.');
        }

        return { wf, client };
    }

    /**
     * Limit the depth of a node tree
     */
    private limitDepth(node: any, currentDepth: number, maxDepth: number): any {
        if (maxDepth !== -1 && currentDepth >= maxDepth) {
            const { items, ...nodeWithoutItems } = node;
            return {
                ...nodeWithoutItems,
                hasChildren: items && items.length > 0,
                items: undefined
            };
        }
        return {
            ...node,
            items: node.items?.map((item: any) => this.limitDepth(item, currentDepth + 1, maxDepth))
        };
    }

    /**
     * Get the root nodes of the Workflowy document
     * @param depth - How many levels deep to return. 0 = top level only, -1 = unlimited (use carefully!)
     */
    async getRootItems(username?: string, password?: string, depth: number = 0) {
        const { wf, client } = await this.createAuthenticatedClient(username, password);
        const doc = await wf.getDocument();
        client.getTreeData()
        const root = doc.root.toJson();
        return this.limitDepth(root, -1, depth);
    }

    /**
     * Get the child nodes of a specific node
     * @param depth - How many levels deep to return. 0 = immediate children only, -1 = unlimited (use carefully!)
     */
    async getChildItems(parentId: string, username?: string, password?: string, depth: number = 0) {
        const {wf, client } = await this.createAuthenticatedClient(username, password);
        let doc = await wf.getDocument();
        const parent = this.findNodeById(doc.root, parentId);
        if (!parent) {
            throw new Error(`Parent node with ID ${parentId} not found.`);
        }
        const parentJson = parent.toJson();
        const limited = this.limitDepth(parentJson, -1, depth);
        return limited.items || [];
    }

    /**
     * Search for nodes in Workflowy
     */
    async search(query: string, username?: string, password?: string) {
        const { wf } = await this.createAuthenticatedClient(username, password);
        const t = await wf.getDocument();
        const items = t.root.items;
        let results = [];
        let stack = [...t.root.items];
        while (stack.length > 0) {
            const current = stack.pop();
            if (current!.name.toLowerCase().includes(query.toLowerCase())) {
                results.push(current!.toJson());
            }
            if (current!.items) {
                stack.push(...current!.items);
            }
        }
        // need to traverse the tree to find all items

        return results
    }

    /**
     * Create a new node at a specific location
     */
    async createNode(parentId: string | undefined, name: string, description?: string, username?: string, password?: string) {
        const { wf } = await this.createAuthenticatedClient(username, password);
        const doc = await wf.getDocument();

        let parent;
        if (parentId) {
            parent = this.findNodeById(doc.root, parentId);
            if (!parent) {
                throw new Error(`Parent node with ID ${parentId} not found.`);
            }
        } else {
            parent = doc.root;
        }

        const newNode = await parent.createItem();
        newNode.setName(name);
        if (description) {
            newNode.setNote(description);
        }
        // Always save - isDirty() may not detect all changes
        await doc.save();
        return newNode.id;
    }

    /**
     * Recursively find a node by ID
     */
    private findNodeById(node: any, id: string): any {
        if (node.id === id) {
            return node;
        }
        if (node.items) {
            for (const child of node.items) {
                const found = this.findNodeById(child, id);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Update an existing node
     */
    async updateNode(nodeId: string, name?: string, description?: string, username?: string, password?: string) {
        const { wf } = await this.createAuthenticatedClient(username, password);
        const doc = await wf.getDocument();
        const node = this.findNodeById(doc.root, nodeId);
        if (!node) {
            throw new Error(`Node with ID ${nodeId} not found.`);
        }

        if (name !== undefined) {
            node.setName(name);
        }
        if (description !== undefined) {
            node.setNote(description);
        }
        if (doc.isDirty()) {
            // Saves the changes if there are any
            await doc.save();
        }
    }

    /**
     * Delete a node
     */
    async deleteNode(nodeId: string, username?: string, password?: string) {
        const { wf } = await this.createAuthenticatedClient(username, password);
        const doc = await wf.getDocument();
        const node = this.findNodeById(doc.root, nodeId);
        if (!node) {
            throw new Error(`Node with ID ${nodeId} not found.`);
        }

        await node.delete();
        if (doc.isDirty()) {
            // Saves the changes if there are any
            await doc.save();
        }
    }

    /**
     * Complete/uncomplete a node
     */
    async toggleComplete(nodeId: string, completed: boolean, username?: string, password?: string) {
        const { wf } = await this.createAuthenticatedClient(username, password);
        const doc = await wf.getDocument();
        const node = this.findNodeById(doc.root, nodeId);
        if (!node) {
            throw new Error(`Node with ID ${nodeId} not found.`);
        }

        if (completed) {
            await node.setCompleted();
        } else {
            await node.setCompleted(false);
        }

        if (doc.isDirty()) {
            // Saves the changes if there are any
            await doc.save();
        }
    }
}

// Export a singleton instance - still a singleton but methods are stateless
export const workflowyClient = new WorkflowyClient();