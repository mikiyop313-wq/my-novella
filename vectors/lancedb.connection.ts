import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import { app } from 'electron';
import * as fs from 'fs';
import { ManuscriptVectorRecord } from '../shared/models/vector.model';

const isDev = process.env.NODE_ENV === 'development';

// Define the path for the vector database
const vectorDbPath = (isDev || !app)
    ? '.data/vectors'
    : path.join(app.getPath('userData'), 'vectors');

// Ensure the directory exists
if (!fs.existsSync(vectorDbPath)) {
    fs.mkdirSync(vectorDbPath, { recursive: true });
}

// ManuscriptVectorRecord and EmbeddingModel live in shared/models/vector.model.ts
export type { ManuscriptVectorRecord } from '../shared/models/vector.model';


export class VectorDatabase {
    private static instance: VectorDatabase;
    private db: lancedb.Connection | null = null;

    private constructor() { }

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

        // Create the table with a dummy record to define the schema.
        // Flattened fields are used instead of a single 'metadata' JSON string
        // to allow efficient SQL-like filtering in LanceDB (e.g., `.where("model = 'openAI'")`)
        // dimensions should match your embedding model (e.g., 1024-1536 for Voyage/OpenAI)
        const schema: ManuscriptVectorRecord[] = [
            {
                id: 'init',
                bookId: 'init',
                actId: 'init',
                chapterId: 'init',
                sceneId: 'init',
                text: 'initialization',
                vector: new Array(1536).fill(0),
                model: 'local',
                hash: 'init',
                position: 0,
                charCount: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        ];

        return await conn.createTable('manuscript', schema as Record<string, any>[]);
    }
}

export const vectorDb = VectorDatabase.getInstance();
