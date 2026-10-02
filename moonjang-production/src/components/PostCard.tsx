import type { Post } from "../domain";

export function PostCard({post, onOpen, onCollect, onProfile}:{post:Post;onOpen:(p:Post)=>void;onCollect?:(p:Post)=>void;onProfile?:(handle:string)=>void}) {
  return <article className="post-card" data-post-id={post.id}>
    <button className="post-body-button" onClick={() => onOpen(post)}>
      {post.title && <h2 className="post-title">{post.title}</h2>}
      <p className={post.type === "sentence" ? "sentence" : "article-lead"}>{post.leadSentence || post.content}</p>
      {post.type === "article" && <span className="read-more">이 문장에서 시작된 글 · 읽기</span>}
    </button>
    <div className="post-meta">
      {onProfile?<button className="author-link" onClick={() => onProfile(post.author.handle)}>{post.author.penName}</button>:<span className="author-static">{post.author.penName}</span>}
      <span>{post.topics.slice(0,2).join(" · ")}</span>
      {post.longRead && <span>오래 읽힌</span>}
      {post.revisited && <span>다시 찾은</span>}
    </div>
    <div className="post-actions">
      {onCollect&&<button className={post.collected ? "quiet-action active" : "quiet-action"} onClick={() => onCollect(post)}>{post.collected ? "간직됨" : "간직하기"}</button>}
      <button className="quiet-action" onClick={() => onOpen(post)}>한마디 {post.commentCount ? `· ${post.commentCount}` : ""}</button>
    </div>
  </article>
}
