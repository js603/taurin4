import type { Collection, Comment, DiscoverPayload, Insights, NotificationItem, Post, Profile, Session } from "../domain";
import { localDb, type OutboxItem } from "./localDb";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function normalizeBase(value: string) {
  return value.replace(/\/+$/, "");
}

function uid(prefix = "local") {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${value}`;
}

function isNetworkFailure(error: unknown) {
  return !(error instanceof ApiError);
}

export class ApiClient {
  private token = "";
  private base = normalizeBase(import.meta.env.VITE_API_BASE || "https://api.moonjang.invalid");
  private flushing = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => { void this.flushOutbox(); });
    }
  }

  configure(base: string, token?: string) {
    if (base) this.base = normalizeBase(base);
    if (token !== undefined) this.token = token;
    if (this.token && this.online()) queueMicrotask(() => { void this.flushOutbox(); });
  }

  getBase() { return this.base; }
  private online() { return typeof navigator === "undefined" || navigator.onLine !== false; }

  private async raw<T>(path: string, init: RequestInit = {}, mutationId?: string): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    if (mutationId) headers.set("X-Moonjang-Mutation-Id", mutationId);
    const response = await fetch(`${this.base}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, payload.error || `HTTP ${response.status}`);
    return payload as T;
  }

  private async cached<T>(key: string, path: string): Promise<T> {
    if (this.online()) {
      try {
        await this.flushOutbox();
        const fresh = await this.raw<T>(path);
        await localDb.cacheSet(key, fresh);
        return fresh;
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) throw error;
      }
    }
    const cached = await localDb.cacheGet<T>(key);
    if (cached) return cached;
    throw new ApiError(503, "인터넷 연결이 필요합니다. 아직 이 화면의 오프라인 사본이 없습니다.");
  }

  private async enqueue(method: string, path: string, body?: unknown, optimisticId?: string) {
    const item: OutboxItem = {
      id: uid("mutation"), method, path,
      body: body === undefined ? undefined : JSON.stringify(body),
      createdAt: Date.now(), attempts: 0, optimisticId,
    };
    await localDb.outboxAdd(item);
    return item;
  }

  private async reconcile(item: OutboxItem, payload: any) {
    if (item.path === "/v1/posts" && item.method === "POST" && payload?.post) {
      const feed = await localDb.cacheGet<{items:Post[]}>("feed");
      if (feed) {
        const items = feed.items.map(p => p.id === item.optimisticId ? payload.post : p);
        if (!items.some(p => p.id === payload.post.id)) items.unshift(payload.post);
        await localDb.cacheSet("feed", {items});
      }
      if (item.optimisticId) await localDb.cacheRemove(`post:${item.optimisticId}`);
      await localDb.cacheSet(`post:${payload.post.id}`, {post:payload.post,comments:[]});
    }
    if (item.path === "/v1/collections" && item.method === "POST" && payload?.collection) {
      const collections = await localDb.cacheGet<{items:Collection[]}>("collections");
      if (collections) {
        const items = collections.items.map(c => c.id === item.optimisticId ? payload.collection : c);
        if (!items.some(c => c.id === payload.collection.id)) items.push(payload.collection);
        await localDb.cacheSet("collections", {items});
      }
    }
  }

  async flushOutbox() {
    if (this.flushing || !this.online() || !this.token) return;
    this.flushing = true;
    try {
      const items = await localDb.outboxList();
      for (const item of items) {
        try {
          const payload = await this.raw<any>(item.path, {method:item.method, body:item.body}, item.id);
          await this.reconcile(item, payload);
          await localDb.outboxRemove(item.id);
        } catch (error) {
          await localDb.outboxMarkAttempt(item.id);
          if (error instanceof ApiError && error.status === 409 && item.path === "/v1/posts") {
            await localDb.outboxRemove(item.id);
            continue;
          }
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
            await localDb.outboxRemove(item.id);
            continue;
          }
          break;
        }
      }
      const draft = await localDb.get<{content:string;type:string}>("draftLocal");
      if (draft?.content) {
        try { await this.raw("/v1/drafts", {method:"PUT", body:JSON.stringify(draft)}); } catch { /* 다음 연결에서 재시도 */ }
      }
    } finally {
      this.flushing = false;
    }
  }

  health() { return this.raw<{ok: boolean}>("/health"); }

  async createAnonymous(handle: string, penName: string) {
    const session = await this.raw<Session>("/v1/auth/anonymous", { method: "POST", body: JSON.stringify({ handle, penName }) });
    await localDb.cacheSet("me", {user:session.user});
    return session;
  }

  async me() {
    if (this.online()) {
      try {
        const value = await this.raw<{user:Profile}>("/v1/me");
        await localDb.cacheSet("me", value);
        return value;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) throw error;
        if (error instanceof ApiError && error.status < 500) throw error;
      }
    }
    const cached = await localDb.cacheGet<{user:Profile}>("me");
    if (cached) return cached;
    const session = await localDb.get<Session>("session");
    if (session) return {user:session.user};
    throw new ApiError(503,"오프라인 세션을 복구할 수 없습니다.");
  }

  deleteAccount() { return this.raw<{ok:boolean}>("/v1/me", {method:"DELETE"}); }
  feed() { return this.cached<{items: Post[]}>("feed", "/v1/feed"); }
  discover() { return this.cached<DiscoverPayload>("discover", "/v1/discover"); }
  post(id: string) { return this.cached<{post: Post; comments: Comment[]}>(`post:${id}`, `/v1/posts/${id}`); }

  async createPost(input: {type: string; title?: string; content: string; leadSentence?: string; topics: string[]; visibility: "public"|"unlisted"|"private"}) {
    if (this.online()) {
      try {
        const result = await this.raw<{post:Post}>("/v1/posts", {method:"POST",body:JSON.stringify(input)});
        const feed = await localDb.cacheGet<{items:Post[]}>("feed");
        if (feed) await localDb.cacheSet("feed", {items:[result.post,...feed.items.filter(p=>p.id!==result.post.id)]});
        await localDb.cacheSet(`post:${result.post.id}`, {post:result.post,comments:[]});
        return result;
      } catch (error) {
        if (!isNetworkFailure(error) || this.online()) throw error;
      }
    }
    const session = await localDb.get<Session>("session");
    if (!session) throw new ApiError(503,"첫 로그인은 인터넷 연결이 필요합니다.");
    const optimisticId=uid("local-post");
    const post: Post = {
      id:optimisticId, author:session.user, type:input.type === "article" ? "article" : "sentence",
      title:input.title, content:input.content, leadSentence:input.leadSentence, topics:input.topics,
      createdAt:new Date().toISOString(), collected:false, collectionCount:0, commentCount:0, visibility:input.visibility,
    };
    await this.enqueue("POST","/v1/posts",input,optimisticId);
    const feed=await localDb.cacheGet<{items:Post[]}>("feed");
    await localDb.cacheSet("feed",{items:[post,...(feed?.items ?? [])]});
    await localDb.cacheSet(`post:${optimisticId}`,{post,comments:[]});
    await localDb.set("draftLocal",{content:"",type:"sentence"});
    return {post};
  }

  async updatePost(id: string, input: Record<string, unknown>) {
    if (this.online()) {
      try { return await this.raw<{post:Post}>(`/v1/posts/${id}`,{method:"PATCH",body:JSON.stringify(input)}); }
      catch(error){ if(!isNetworkFailure(error)||this.online()) throw error; }
    }
    await this.enqueue("PATCH",`/v1/posts/${id}`,input);
    const cached=await localDb.cacheGet<{post:Post;comments:Comment[]}>(`post:${id}`);
    if(!cached) throw new ApiError(503,"이 글의 오프라인 사본이 없습니다.");
    const post={...cached.post,...input} as Post;
    await localDb.cacheSet(`post:${id}`,{...cached,post});
    const feed=await localDb.cacheGet<{items:Post[]}>("feed");
    if(feed) await localDb.cacheSet("feed",{items:feed.items.map(p=>p.id===id?post:p)});
    return {post};
  }

  async deletePost(id: string) {
    if(this.online()){
      try{return await this.raw<{ok:boolean}>(`/v1/posts/${id}`,{method:"DELETE"});}
      catch(error){if(!isNetworkFailure(error)||this.online()) throw error;}
    }
    await this.enqueue("DELETE",`/v1/posts/${id}`);
    const feed=await localDb.cacheGet<{items:Post[]}>("feed");
    if(feed) await localDb.cacheSet("feed",{items:feed.items.filter(p=>p.id!==id)});
    await localDb.cacheRemove(`post:${id}`);
    return {ok:true};
  }

  async toggleCollect(id: string) {
    if(this.online()){
      try{
        const result=await this.raw<{collected:boolean}>(`/v1/posts/${id}/collect`,{method:"POST"});
        await this.patchCollectedCache(id,result.collected); return result;
      }catch(error){if(!isNetworkFailure(error)||this.online()) throw error;}
    }
    const cached=await localDb.cacheGet<{post:Post;comments:Comment[]}>(`post:${id}`);
    const feed=await localDb.cacheGet<{items:Post[]}>("feed");
    const current=cached?.post.collected ?? feed?.items.find(p=>p.id===id)?.collected ?? false;
    const collected=!current;
    await this.enqueue("POST",`/v1/posts/${id}/collect`);
    await this.patchCollectedCache(id,collected);
    return {collected};
  }

  private async patchCollectedCache(id:string,collected:boolean){
    const cached=await localDb.cacheGet<{post:Post;comments:Comment[]}>(`post:${id}`);
    if(cached) await localDb.cacheSet(`post:${id}`,{...cached,post:{...cached.post,collected}});
    const feed=await localDb.cacheGet<{items:Post[]}>("feed");
    if(feed) await localDb.cacheSet("feed",{items:feed.items.map(p=>p.id===id?{...p,collected}:p)});
  }

  async toggleFollow(userId: string) {
    if(this.online()){
      try{
        const result=await this.raw<{following:boolean}>(`/v1/writers/${userId}/follow`,{method:"POST"});
        await localDb.set(`follow:${userId}`,result.following); return result;
      }catch(error){if(!isNetworkFailure(error)||this.online()) throw error;}
    }
    const current=await localDb.get<boolean>(`follow:${userId}`) ?? false;
    const following=!current; await localDb.set(`follow:${userId}`,following);
    await this.enqueue("POST",`/v1/writers/${userId}/follow`);
    return {following};
  }

  async addComment(id: string, content: string) {
    if(this.online()){
      try{return await this.raw<{comment:Comment}>(`/v1/posts/${id}/comments`,{method:"POST",body:JSON.stringify({content})});}
      catch(error){if(!isNetworkFailure(error)||this.online()) throw error;}
    }
    const session=await localDb.get<Session>("session"); if(!session) throw new ApiError(503,"로그인이 필요합니다.");
    const comment:Comment={id:uid("local-comment"),author:session.user,content,createdAt:new Date().toISOString()};
    await this.enqueue("POST",`/v1/posts/${id}/comments`,{content},comment.id);
    const cached=await localDb.cacheGet<{post:Post;comments:Comment[]}>(`post:${id}`);
    if(cached) await localDb.cacheSet(`post:${id}`,{...cached,comments:[...cached.comments,comment]});
    return {comment};
  }

  profile(handle: string) { return this.cached<{profile: Profile; posts: Post[]}>(`profile:${handle}`, `/v1/profiles/${encodeURIComponent(handle)}`); }
  collections() { return this.cached<{items: Collection[]}>("collections", "/v1/collections"); }

  async createCollection(title: string, description = "", visibility: "private"|"public" = "private") {
    const input={title,description,visibility};
    if(this.online()){
      try{
        const result=await this.raw<{collection:Collection}>("/v1/collections",{method:"POST",body:JSON.stringify(input)});
        const cache=await localDb.cacheGet<{items:Collection[]}>("collections");
        if(cache) await localDb.cacheSet("collections",{items:[...cache.items,result.collection]}); return result;
      }catch(error){if(!isNetworkFailure(error)||this.online()) throw error;}
    }
    const optimisticId=uid("local-collection");
    const collection:Collection={id:optimisticId,title,description,visibility,itemCount:0,items:[]};
    await this.enqueue("POST","/v1/collections",input,optimisticId);
    const cache=await localDb.cacheGet<{items:Collection[]}>("collections");
    await localDb.cacheSet("collections",{items:[...(cache?.items??[]),collection]});
    return {collection};
  }

  collection(id: string) { return this.cached<{collection: Collection}>(`collection:${id}`, `/v1/collections/${id}`); }

  async addCollectionItem(collectionId: string, postId: string) {
    const body={postId};
    if(this.online()){
      try{return await this.raw<{ok:boolean}>(`/v1/collections/${collectionId}/items`,{method:"POST",body:JSON.stringify(body)});}
      catch(error){if(!isNetworkFailure(error)||this.online()) throw error;}
    }
    await this.enqueue("POST",`/v1/collections/${collectionId}/items`,body);
    return {ok:true};
  }

  async saveDraft(content: string, type = "sentence") {
    await localDb.set("draftLocal",{content,type});
    if(!this.online()) return {ok:true};
    try{return await this.raw<{ok:boolean}>("/v1/drafts",{method:"PUT",body:JSON.stringify({content,type})});}
    catch(error){if(isNetworkFailure(error)) return {ok:true}; throw error;}
  }

  async draft() {
    const local=await localDb.get<{content:string;type:string}>("draftLocal");
    if(local?.content) return local;
    if(!this.online()) return local ?? {content:"",type:"sentence"};
    try{
      const remote=await this.raw<{content:string;type:string}>("/v1/drafts");
      await localDb.set("draftLocal",remote); return remote;
    }catch(error){if(isNetworkFailure(error)) return local ?? {content:"",type:"sentence"}; throw error;}
  }

  notifications() { return this.cached<{items: NotificationItem[]}>("notifications", "/v1/notifications"); }
  insights() { return this.cached<Insights>("insights", "/v1/insights"); }
  search(q: string) { return this.cached<{posts: Post[]; profiles: Profile[]}>(`search:${q.trim().toLowerCase()}`, `/v1/search?q=${encodeURIComponent(q)}`); }

  async report(postId: string, reason: string) {
    if(this.online()){
      try{return await this.raw<{ok:boolean}>("/v1/reports",{method:"POST",body:JSON.stringify({postId,reason})});}
      catch(error){if(!isNetworkFailure(error)||this.online()) throw error;}
    }
    await this.enqueue("POST","/v1/reports",{postId,reason}); return {ok:true};
  }

  async block(userId: string) {
    if(this.online()){
      try{return await this.raw<{blocked:boolean}>(`/v1/blocks/${userId}`,{method:"POST"});}
      catch(error){if(!isNetworkFailure(error)||this.online()) throw error;}
    }
    await this.enqueue("POST",`/v1/blocks/${userId}`); return {blocked:true};
  }

  async event(kind: string, postId?: string) {
    if(!this.online()) return {ok:false};
    try{return await this.raw<{ok:boolean}>("/v1/events",{method:"POST",body:JSON.stringify({kind,postId})});}
    catch{return {ok:false};}
  }
}

export const api = new ApiClient();
