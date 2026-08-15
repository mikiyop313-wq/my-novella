import * as lancedb from '@lancedb/lancedb';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import type {
    EmbeddingSpaceDescriptor,
    ManuscriptVectorRecord,
} from '../shared/models/vector.model';
import {
    tableNameForEmbeddingSpace,
} from './embedding-space';

const isDev = process.env['NODE_ENV'] === 'development';
const vectorDbPath = (isDev || !app)
    ? '.data/vectors'
    : path.join(app.getPath('userData'), 'vectors');
const MANUSCRIPT_TABLE_PREFIX = 'manuscript_';
const LEGACY_MANUSCRIPT_TABLE = 'manuscript';

if (!fs.existsSync(vectorDbPath)) {
    fs.mkdirSync(vectorDbPath, { recursive: true });
}

export type { ManuscriptVectorRecord } from '../shared/models/vector.model';

export { embeddingSpaceId } from './embedding-space';

export function escapeLanceSql(value: string): string {
    return value.replace(/'/g, "''");
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

    public async connect(): Promise<lancedb.Connection> {
        if (this.db) return this.db;

        this.db = await lancedb.connect(vectorDbPath);
        console.log('Successfully connected to LanceDB at:', vectorDbPath);
        return this.db;
    }

    public tableNameForSpace(space: EmbeddingSpaceDescriptor): string {
        return tableNameForEmbeddingSpace(space);
    }

    public async getManuscriptTable(space: EmbeddingSpaceDescriptor) {
        const conn = await this.connect();
        const tableName = this.tableNameForSpace(space);
        const tableNames = await conn.tableNames();

        if (tableNames.includes(tableName)) {
            return conn.openTable(tableName);
        }

        const now = Date.now();
        const schemaRecord: ManuscriptVectorRecord = {
            id: '__schema__',
            bookId: '__schema__',
            actId: '__schema__',
            chapterId: '__schema__',
            sceneId: '__schema__',
            text: '',
            vector: new Array(space.dimensions).fill(0),
            provider: space.provider,
            model: space.model,
            revision: space.revision,
            hash: '',
            position: 0,
            charCount: 0,
            createdAt: now,
            updatedAt: now,
        };

        return conn.createTable(
            tableName,
            [schemaRecord as unknown as Record<string, unknown>],
        );
    }

    public async deleteBookFromOtherSpaces(
        bookId: string,
        activeSpace: EmbeddingSpaceDescriptor,
    ): Promise<void> {
        const conn = await this.connect();
        const activeTable = this.tableNameForSpace(activeSpace);
        const predicate = `bookId = '${escapeLanceSql(bookId)}'`;

        for (const tableName of await conn.tableNames()) {
            if (!tableName.startsWith(MANUSCRIPT_TABLE_PREFIX) || tableName === activeTable) {
                continue;
            }
            const table = await conn.openTable(tableName);
            await table.delete(predicate);
        }
    }

    public async retireLegacyManuscriptTable(): Promise<void> {
        const conn = await this.connect();
        if ((await conn.tableNames()).includes(LEGACY_MANUSCRIPT_TABLE)) {
            await conn.dropTable(LEGACY_MANUSCRIPT_TABLE);
        }
    }
}

export const vectorDb = VectorDatabase.getInstance();
