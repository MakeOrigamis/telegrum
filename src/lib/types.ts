export type Profile = {
  pubkey: string;
  displayName: string;
  boxPublicKey: string;
  updatedAt: string;
};

export type ConversationType = "dm" | "group";

export type KeyWrap = {
  nonce: string;
  ciphertext: string;
  fromBoxPublicKey: string;
};

export type Conversation = {
  id: string;
  type: ConversationType;
  title: string;
  memberPubkeys: string[];
  keyWraps: Record<string, KeyWrap>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  lastMessagePreview?: string;
};

export type MessageKind = "text" | "image" | "system";

export type ChatMessage = {
  id: string;
  conversationId: string;
  sender: string;
  kind: MessageKind;
  /** encrypted payload (base64) */
  nonce: string;
  ciphertext: string;
  replyToId?: string;
  createdAt: string;
};

export type DecryptedMessage = {
  id: string;
  conversationId: string;
  sender: string;
  kind: MessageKind;
  text: string;
  mediaUrl?: string;
  replyToId?: string;
  createdAt: string;
  fromMe: boolean;
};
