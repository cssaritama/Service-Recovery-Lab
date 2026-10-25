import {createState, uuid, type State} from './domain.ts';
export interface Statement { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<{meta?: {changes?: number}}> }
export interface Database { prepare(sql: string): Statement }
type Row = {id:string; document:string; revision:number; token_hash:string; expires_at:number};
export class RepoError extends Error { status:number; code:string; constructor(status:number, code:string) {super(code);this.status=status;this.code=code;} }
export class Repository {
  db:Database;
  constructor(db:Database) {this.db=db;}
  async create(tokenHash:string, now=Date.now()):Promise<State> {
    await this.db.prepare('DELETE FROM workspaces WHERE expires_at <= ?').bind(now).run();
    const state=createState();
    const inserted=await this.db.prepare('INSERT INTO workspaces (id, token_hash, document, revision, created_at, expires_at) SELECT ?, ?, ?, 0, ?, ? WHERE (SELECT count(*) FROM workspaces) < 1000').bind(state.id,tokenHash,JSON.stringify(state),now,now+86400000).run();
    if (!inserted.meta?.changes) throw new RepoError(429,'demo_workspace_limit');
    return state;
  }
  async byToken(hash:string):Promise<State|null> {
    const row=await this.db.prepare('SELECT * FROM workspaces WHERE token_hash = ? AND expires_at > ?').bind(hash,Date.now()).first<Row>();
    return row ? JSON.parse(row.document) : null;
  }
  async read(id:string):Promise<State> {
    const row=await this.db.prepare('SELECT * FROM workspaces WHERE id = ? AND expires_at > ?').bind(id,Date.now()).first<Row>();
    if (!row) throw new RepoError(401,'workspace_expired');
    return JSON.parse(row.document);
  }
  async mutate<T>(id:string, change:(state:State)=>T):Promise<{state:State; result:T}> {
    for (let attempt=0;attempt<24;attempt++) {
      const row=await this.db.prepare('SELECT * FROM workspaces WHERE id = ? AND expires_at > ?').bind(id,Date.now()).first<Row>();
      if (!row) throw new RepoError(401,'workspace_expired');
      const state:State=JSON.parse(row.document);
      const result=change(state);
      const document=JSON.stringify(state);
      if (document.length > 240000) throw new RepoError(429,'workspace_storage_limit');
      const update=await this.db.prepare('UPDATE workspaces SET document = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(document,id,row.revision).run();
      if (update.meta?.changes===1) return {state,result};
      await new Promise(resolve=>setTimeout(resolve, Math.min(attempt*2,20)));
    }
    throw new RepoError(409,'workspace_busy_retry');
  }
}
export async function hashToken(token:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function newToken() {return uuid().replaceAll('-','')+uuid().replaceAll('-','');}
