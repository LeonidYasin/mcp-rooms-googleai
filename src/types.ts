export type ListingCategory = 'things' | 'services' | 'rides' | 'delivery' | 'other';

export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  things: 'Вещи',
  services: 'Услуги',
  rides: 'Поездки',
  delivery: 'Доставка',
  other: 'Другое',
};

export type ListingKind = 'offer' | 'request';

export const KIND_LABELS: Record<ListingKind, string> = {
  offer: 'Предлагаю',
  request: 'Хочу (Ищу)',
};

export type FulfilmentMode = 'pickup' | 'shipping' | 'online';

export const MODE_LABELS: Record<FulfilmentMode, string> = {
  pickup: 'Самовывоз',
  shipping: 'Доставка',
  online: 'Онлайн',
};

export type ListingStatus = 'draft' | 'active' | 'paused' | 'fulfilled' | 'archived';

export interface ListingPhoto {
  id: string;
  name?: string;
  dataUrl: string;
  caption?: string;
}

export interface ListingContent {
  title: string;
  description: string;
  category: ListingCategory;
  subcategory?: string;
  kind: ListingKind;
  modes: FulfilmentMode[];
  locality: string;
  region?: string;
  country?: string;
  price_minor: number | null; // in cents/kopecks (null = by agreement)
  currency: string;
  media_ids: string[];
  condition?: string;
}

export interface Listing {
  id: string;
  owner: string;
  author_name: string;
  content: ListingContent;
  status: ListingStatus;
  visibility: 'public' | 'private';
  revision: number;
  created_at: number;
  updated_at: number;
  expires_at: number;
  photos: ListingPhoto[];
  responses_count: number;
  responses_summary?: {
    opened: number;
    answered: number;
    agreed: number;
    declined: number;
  };
}

export interface McpMessage {
  id: string;
  roomId: string;
  sender: string;
  role: 'human' | 'agent' | 'system';
  text: string;
  timestamp: number;
  toolCall?: {
    tool: string;
    params: any;
    result?: any;
  };
}

export interface McpRoom {
  id: string;
  title: string;
  listingId?: string;
  listingTitle?: string;
  participants: string[];
  messages: McpMessage[];
  status: 'active' | 'closed';
}
