export type PostType = "sentence" | "article";

export interface Session {
  token: string;
  user: Profile;
}

export interface Profile {
  id: string;
  handle: string;
  penName: string;
  tagline: string;
  role?: "user" | "editor" | "admin";
  following?: boolean;
}

export interface Post {
  id: string;
  author: Profile;
  type: PostType;
  title?: string;
  content: string;
  leadSentence?: string;
  topics: string[];
  createdAt: string;
  collected: boolean;
  collectionCount?: number;
  commentCount?: number;
  longRead?: boolean;
  revisited?: boolean;
  visibility?: "public" | "unlisted" | "private";
}

export interface Comment {
  id: string;
  author: Profile;
  content: string;
  createdAt: string;
}

export interface Collection {
  id: string;
  title: string;
  description: string;
  visibility: "private" | "public";
  itemCount: number;
  items?: Post[];
}

export interface NotificationItem {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface Insights {
  postsThisMonth: number;
  uniqueReaders: number;
  collections: number;
  crossReads: number;
  topPost?: Post;
  narrative: string[];
}

export interface DiscoverPayload {
  longRead: Post[];
  newWriters: Profile[];
  editorial: Post[];
  publicCollections: Collection[];
  random: Post | null;
}
