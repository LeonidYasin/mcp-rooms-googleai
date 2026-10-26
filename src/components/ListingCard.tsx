import React from 'react';
import { Listing, CATEGORY_LABELS, MODE_LABELS } from '../types';

interface ListingCardProps {
  listing: Listing;
  onOpen: (listing: Listing) => void;
}

export const formatPrice = (priceMinor: number | null, currency: string = 'RUB'): string => {
  if (priceMinor === null || priceMinor === undefined) {
    return 'Цена по договорённости';
  }
  const rubles = Math.floor(priceMinor / 100);
  const formatted = rubles.toLocaleString('ru-RU');
  const currencySymbol = currency === 'RUB' ? '₽' : currency;
  return `${formatted} ${currencySymbol}`;
};

export const ListingCard: React.FC<ListingCardProps> = ({ listing, onOpen }) => {
  const { content, photos, responses_count } = listing;

  const modesText = content.modes.map((m) => MODE_LABELS[m]).join(' или ');
  const locationText = [content.locality, modesText].filter(Boolean).join(' · ');

  return (
    <article className="border border-[var(--line)] rounded-xl p-5 md:p-6 bg-[var(--canvas)] hover:border-[var(--blue)] transition-all flex flex-col md:flex-row justify-between gap-5 items-start md:items-center shadow-xs">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-[var(--green)] bg-[var(--greenbg)] px-2.5 py-0.5 rounded">
            {content.kind === 'offer' ? 'Предлагаю' : 'Хочу'} · {CATEGORY_LABELS[content.category]}
          </span>
          {content.subcategory && (
            <span className="text-xs text-[var(--muted)]">
              → {content.subcategory}
            </span>
          )}
          {responses_count > 0 && (
            <span className="text-xs text-[var(--blue)] bg-[var(--soft)] px-2 py-0.5 rounded font-medium">
              Откликов: {responses_count}
            </span>
          )}
        </div>

        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--ink)] mb-1 leading-snug">
          {content.title}
        </h2>

        <p className="text-sm text-[var(--muted)] mb-3">
          {locationText || 'Локация не указана'}
        </p>

        <p className="text-sm text-[var(--muted)] line-clamp-2 mb-4 leading-relaxed">
          {content.description}
        </p>

        <button
          type="button"
          onClick={() => onOpen(listing)}
          className="h-10 px-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--raised)] text-[var(--ink)] font-semibold text-sm transition-colors cursor-pointer inline-flex items-center gap-1.5"
        >
          <span>Открыть карточку</span>
          <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="md:text-right shrink-0 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-[var(--line)] flex md:flex-col justify-between items-center md:items-end">
        <div className="text-2xl md:text-[28px] font-black text-[var(--ink)] tracking-tight">
          {formatPrice(content.price_minor, content.currency)}
        </div>
        {photos && photos.length > 0 ? (
          <div className="mt-2 text-xs text-[var(--muted)] flex items-center gap-1">
            <span>📷 Фото: {photos.length}</span>
          </div>
        ) : (
          <div className="text-xs text-[var(--muted)] mt-1">
            Без фото
          </div>
        )}
      </div>
    </article>
  );
};
