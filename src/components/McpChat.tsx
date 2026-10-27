import React, { useState, useRef, useEffect } from 'react';
import { Listing, McpRoom } from '../types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  executedTools?: Array<{
    name: string;
    args: any;
    result: any;
  }>;
  createdListing?: any;
}

interface McpChatProps {
  listings: Listing[];
  rooms: McpRoom[];
  onOpenListing: (listing: Listing) => void;
  onListingCreated: (listing: Listing) => void;
}

export const McpChat: React.FC<McpChatProps> = ({
  listings,
  rooms,
  onOpenListing,
  onListingCreated,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        'Здравствуйте! Я AI-ассистент маркетплейса «Хочу · Предлагаю», подключённый к MCP-инструментам площадки.\n\nЯ могу помочь вам:\n• Найти нужные вещи, услуги, поездки или доставку в любом городе;\n• Создать и опубликовать черновик нового объявления;\n• Проверить условия и детали сделки;\n• Проверить сообщения в защищённой комнате переговоров.\n\nЧем я могу вам помочь сегодня?',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gemini-3.8-flash' | 'gemini-3.1-flash-lite'>(
    'gemini-3.8-flash'
  );
  const [expandedToolIndex, setExpandedToolIndex] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          contextListings: listings,
          contextRooms: rooms,
          model: selectedModel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка связи с сервером');
      }

      const assistantMessage: ChatMessage = {
        id: 'msg-' + (Date.now() + 1),
        role: 'assistant',
        content: data.text || 'Ответ сформирован.',
        timestamp: Date.now(),
        executedTools: data.executedTools || [],
        createdListing: data.createdListing,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // If a listing was created, notify parent component to add to listings state
      if (data.createdListing) {
        onListingCreated(data.createdListing);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'msg-' + (Date.now() + 1),
          role: 'assistant',
          content: `⚠️ Не удалось связаться с Gemini API: ${err.message || 'Ошибка сети'}. Пожалуйста, повторите попытку.`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    '🚴 Найти велосипеды в Казани',
    '📝 Создай объявление о продаже смартфона в Казани за 18000 руб',
    '🔒 Как на площадке защищены личные данные и адрес?',
    '💼 Какие IT-услуги доступны на площадке?',
  ];

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-8 py-6 flex flex-col h-[calc(100vh-180px)] min-h-[600px]">
      {/* Top Header Card */}
      <div className="border border-[var(--line)] rounded-t-2xl p-4 bg-[var(--surface)] flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--soft)] text-[var(--blue)] flex items-center justify-center text-xl font-bold">
            🤖
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[var(--ink)]">
                AI Чат с MCP-инструментами
              </h1>
              <span className="text-[11px] bg-[var(--greenbg)] text-[var(--green)] font-semibold px-2 py-0.5 rounded-full">
                Gemini + MCP
              </span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Интеграция с контрактами объявлений, комнатами и каталогом площадки «Хочу · Предлагаю»
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] bg-[var(--canvas)] border border-[var(--line)] px-2.5 py-1 rounded-md">
            <span>Модель:</span>
            <select
              aria-label="Выбор модели Gemini"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as any)}
              className="bg-transparent font-medium text-[var(--ink)] outline-none cursor-pointer"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (Основная)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Быстрая)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: 'welcome-reset',
                  role: 'assistant',
                  content: 'История чата очищена. Готов к новым запросам к MCP-инструментам!',
                  timestamp: Date.now(),
                },
              ])
            }
            className="text-xs text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--line)] px-2.5 py-1 rounded-md bg-[var(--canvas)] hover:bg-[var(--raised)] transition-colors cursor-pointer"
          >
            Очистить
          </button>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 border-x border-[var(--line)] bg-[var(--canvas)] p-4 md:p-6 overflow-y-auto space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-[var(--muted)] px-1">
              <span>{m.role === 'user' ? 'Вы' : 'Gemini AI (MCP Agent)'}</span>
              <span>·</span>
              <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div
              className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[var(--blue)] text-white font-medium rounded-br-xs'
                  : 'bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] rounded-bl-xs'
              }`}
            >
              {m.content}

              {/* Display Executed MCP Tools if any */}
              {m.executedTools && m.executedTools.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--line)] space-y-2">
                  <div className="text-[11px] font-bold text-[var(--blue)] uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚡ Вызов MCP инструмента:</span>
                    <span className="font-mono bg-[var(--canvas)] px-1.5 py-0.5 rounded border border-[var(--line)]">
                      {m.executedTools[0].name}
                    </span>
                  </div>

                  {m.executedTools.map((t, tIdx) => {
                    const toolKey = `${m.id}-${tIdx}`;
                    const isExpanded = expandedToolIndex === toolKey;
                    return (
                      <div
                        key={toolKey}
                        className="text-xs bg-[var(--canvas)] border border-[var(--line)] rounded-lg p-2.5 space-y-1.5"
                      >
                        <div className="flex justify-between items-center text-[var(--muted)] font-mono text-[11px]">
                          <span>Параметры: {JSON.stringify(t.args)}</span>
                          <button
                            type="button"
                            onClick={() => setExpandedToolIndex(isExpanded ? null : toolKey)}
                            className="text-[var(--blue)] hover:underline ml-2"
                          >
                            {isExpanded ? 'Свернуть' : 'Подробнее'}
                          </button>
                        </div>
                        {isExpanded && (
                          <pre className="text-[10px] bg-[var(--surface)] p-2 rounded overflow-x-auto text-[var(--ink)] font-mono">
                            {JSON.stringify(t.result, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* If a new listing was created via tool, display shortcut */}
              {m.createdListing && (
                <div className="mt-3 p-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-[var(--green)]">🎉 Карточка создана: </span>
                    <strong className="text-[var(--ink)]">{m.createdListing.content.title}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenListing(m.createdListing)}
                    className="px-3 py-1.5 bg-[var(--blue)] text-white rounded-lg font-semibold hover:bg-[var(--blue-hover)] transition-colors shrink-0"
                  >
                    Посмотреть карточку →
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start">
            <div className="text-[11px] text-[var(--muted)] mb-1 px-1">
              Gemini AI (MCP Agent)
            </div>
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl rounded-bl-xs p-4 text-xs text-[var(--muted)] flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--blue)] animate-pulse" />
              <span>Обращение к MCP-инструментам маркетплейса...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Chips */}
      <div className="border-x border-[var(--line)] bg-[var(--surface)] px-4 py-2 flex gap-2 overflow-x-auto text-xs">
        <span className="text-[var(--muted)] py-1 font-medium shrink-0">Подсказки:</span>
        {quickPrompts.map((p, idx) => (
          <button
            key={idx}
            type="button"
            disabled={isLoading}
            onClick={() => handleSendMessage(p)}
            className="px-2.5 py-1 rounded-full bg-[var(--canvas)] hover:bg-[var(--raised)] border border-[var(--line)] text-[var(--ink)] whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="border border-[var(--line)] rounded-b-2xl p-3 bg-[var(--surface)] flex gap-2 shadow-sm"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          placeholder="Спросите о товарах, создайте объявление или уточните правила безопасности..."
          className="flex-1 h-11 px-4 border border-[var(--line)] rounded-xl bg-[var(--canvas)] text-[var(--ink)] text-sm outline-none focus:border-[var(--blue)] transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="h-11 px-5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          <span>Отправить</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </form>
    </div>
  );
};
