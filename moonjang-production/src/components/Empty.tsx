export function Empty({title, body}:{title:string;body:string}) {
  return <div className="empty"><strong>{title}</strong><p>{body}</p></div>;
}
