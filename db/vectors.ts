import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import { app } from 'electron';
import * as fs from 'fs';

const isDev = process.env.NODE_ENV === 'development';

// Define the path for the vector database
const vectorDbPath = (isDev || !app)
    ? '.data/vectors'
    : path.join(app.getPath('userData'), 'vectors');

// Ensure the directory exists
if (!fs.existsSync(vectorDbPath)) {
    fs.mkdirSync(vectorDbPath, { recursive: true });
}

export class VectorDatabase {
    private static instance: VectorDatabase;
    private db: lancedb.Connection | null = null;

    private constructor() {}

    public static getInstance(): VectorDatabase {
        if (!VectorDatabase.instance) {
            VectorDatabase.instance = new VectorDatabase();
        }
        return VectorDatabase.instance;
    }

    /**
     * Connects to the LanceDB instance
     */
    public async connect(): Promise<lancedb.Connection> {
        if (this.db) return this.db;
        
        try {
            this.db = await lancedb.connect(vectorDbPath);
            console.log('Successfully connected to LanceDB at:', vectorDbPath);
            return this.db;
        } catch (error) {
            console.error('Failed to connect to LanceDB:', error);
            throw error;
        }
    }

    /**
     * Helper to get or create the manuscript table
     */
    public async getManuscriptTable() {
        const conn = await this.connect();
        const tableNames = await conn.tableNames();
        
        if (tableNames.includes('manuscript')) {
            return await conn.openTable('manuscript');
        }

        // Create the table with a dummy record to define the schema
        // dimensions should match your embedding model (e.g., 1024-1536 for Voyage/OpenAI)
        const schema = [
            {
                id: 'init',
                bookId: 0,
                chapterId: 0,
                sceneId: 0,
                text: 'initialization',
                vector: new Array(1536).fill(0),
                metadata: JSON.stringify({})
            }
        ];

        return await conn.createTable('manuscript', schema);
    }
}

export const vectorDb = VectorDatabase.getInstance();
