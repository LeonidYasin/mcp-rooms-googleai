import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

let isGeminiKeyFunctional: boolean | null = null;

// Helper to safely get the GoogleGenAI client with user-agent telemetry header
function getGenAiClient(): GoogleGenAI | null {
  if (isGeminiKeyFunctional === false) {
    return null;
  }
  const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (!apiKey || apiKey === 'YOUR_API_KEY' || apiKey.length < 15) {
    isGeminiKeyFunctional = false;
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// MCP Tools function declarations for Gemini
const listActiveListingsTool: FunctionDeclaration = {
  name: 'list_active_listings',
  description:
    'Поиск и получение активных объявлений маркетплейса с фильтрацией по тексту, категории, типу (offer/request) и городу.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Поисковый запрос (например: велосипед, гитара, доставка, курьер)',
      },
      category: {
        type: Type.STRING,
        description:
          'Категория объявления: things (Вещи), services (Услуги), rides (Поездки), delivery (Доставка), other (Другое)',
      },
      kind: {
        type: Type.STRING,
        description: 'Тип: offer (Предлагаю / продажа) или request (Хочу / Ищу / покупка)',
      },
      locality: {
        type: Type.STRING,
        description: 'Город (например: Казань, Москва, Санкт-Петербург)',
      },
    },
  },
};

const getListingDetailsTool: FunctionDeclaration = {
  name: 'get_listing_details',
  description: 'Получить полную информацию, условия, описание и цену конкретного объявления по его ID.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      listing_id: {
        type: Type.STRING,
        description: 'Идентификатор объявления (например: bike-kazan-demo-01)',
      },
    },
    required: ['listing_id'],
  },
};

const createDraftListingTool: FunctionDeclaration = {
  name: 'create_draft_listing',
  description:
    'Создать новое объявление или черновик на площадке Хочу · Предлагаю (MCP Rooms). Позволяет автору выставить вещь или услугу.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'Название объявления (кратко, до 120 символов)',
      },
      description: {
        type: Type.STRING,
        description: 'Подробное описание предмета/услуги, состояние, комплектность и честные условия',
      },
      category: {
        type: Type.STRING,
        description: 'Категория: things, services, rides, delivery, other',
      },
      kind: {
        type: Type.STRING,
        description: 'offer (Предлагаю) или request (Хочу / Ищу)',
      },
      locality: {
        type: Type.STRING,
        description: 'Город (например: Казань, Москва)',
      },
      price_rubles: {
        type: Type.NUMBER,
        description: 'Цена в рублях (если 0 или не указана, будет договорная цена)',
      },
      modes: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Способы передачи: pickup (самовывоз), shipping (доставка), online (онлайн)',
      },
      condition: {
        type: Type.STRING,
        description: 'Состояние вещи (например: Отличное, Б/У, Новое)',
      },
    },
    required: ['title', 'description', 'category', 'kind', 'locality'],
  },
};

const inspectRoomTool: FunctionDeclaration = {
  name: 'inspect_room',
  description: 'Проверить состояние и историю сообщений в защищённой комнате переговоров (Shared Room).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      room_id: {
        type: Type.STRING,
        description: 'Идентификатор комнаты (например: room-bike-negotiation-01)',
      },
    },
    required: ['room_id'],
  },
};

const sendRoomMessageTool: FunctionDeclaration = {
  name: 'send_room_message',
  description: 'Отправить сообщение в комнату переговоров между покупателем и продавцом.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      room_id: {
        type: Type.STRING,
        description: 'Идентификатор комнаты',
      },
      text: {
        type: Type.STRING,
        description: 'Текст сообщения или вопроса',
      },
      sender: {
        type: Type.STRING,
        description: 'Имя отправителя или роль (например: agent:mcp-assistant или user:buyer)',
      },
    },
    required: ['room_id', 'text'],
  },
};

const inspectSafetyGuidelinesTool: FunctionDeclaration = {
  name: 'inspect_safety_guidelines',
  description: 'Получить официальные правила безопасности, приватности и проведения сделок на площадке MCP Rooms.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: {
        type: Type.STRING,
        description: 'Тема: privacy (приватность), pickup (самовывоз), shipping (доставка), payment (оплата)',
      },
    },
  },
};

const mcpTools = [
  listActiveListingsTool,
  getListingDetailsTool,
  createDraftListingTool,
  inspectRoomTool,
  sendRoomMessageTool,
  inspectSafetyGuidelinesTool,
];

// Helper to execute tool calls server-side against the marketplace state
function executeMcpTool(name: string, args: any, context: { listings: any[]; rooms: any[] }) {
  const { listings, rooms } = context;

  switch (name) {
    case 'list_active_listings': {
      let filtered = [...listings];
      if (args.category) {
        filtered = filtered.filter(
          (l) => l.content.category.toLowerCase() === args.category.toLowerCase()
        );
      }
      if (args.kind) {
        filtered = filtered.filter((l) => l.content.kind.toLowerCase() === args.kind.toLowerCase());
      }
      if (args.locality) {
        filtered = filtered.filter(
          (l) =>
            l.content.locality &&
            l.content.locality.toLowerCase().includes(args.locality.toLowerCase())
        );
      }
      if (args.query) {
        const q = args.query.toLowerCase().trim();
        filtered = filtered.filter(
          (l) =>
            l.content.title.toLowerCase().includes(q) ||
            l.content.description.toLowerCase().includes(q) ||
            (l.content.locality && l.content.locality.toLowerCase().includes(q))
        );
      }

      return {
        total_found: filtered.length,
        items: filtered.slice(0, 5).map((l) => ({
          id: l.id,
          title: l.content.title,
          category: l.content.category,
          kind: l.content.kind,
          locality: l.content.locality,
          price_rub: l.content.price_minor ? l.content.price_minor / 100 : 'Договорная',
          modes: l.content.modes,
          author: l.author_name,
        })),
      };
    }

    case 'get_listing_details': {
      const item = listings.find((l) => l.id === args.listing_id);
      if (!item) {
        return { error: 'Объявление с таким ID не найдено' };
      }
      return {
        id: item.id,
        title: item.content.title,
        description: item.content.description,
        category: item.content.category,
        kind: item.content.kind,
        locality: item.content.locality,
        price_rub: item.content.price_minor ? item.content.price_minor / 100 : 'Договорная',
        modes: item.content.modes,
        condition: item.content.condition,
        author: item.author_name,
        revision: item.revision,
        status: item.status,
        responses_count: item.responses_count,
      };
    }

    case 'create_draft_listing': {
      const priceMinor =
        args.price_rubles && args.price_rubles > 0
          ? Math.floor(args.price_rubles * 100)
          : null;

      const newListing = {
        id: 'listing-' + Date.now(),
        owner: 'user:agent-created',
        author_name: 'AI-Ассистент (по поручению пользователя)',
        content: {
          title: args.title,
          description: args.description,
          category: args.category || 'things',
          kind: args.kind || 'offer',
          modes: args.modes || ['pickup'],
          locality: args.locality || 'Казань',
          price_minor: priceMinor,
          currency: 'RUB',
          media_ids: [],
          condition: args.condition || 'Указано в описании',
        },
        status: 'active',
        visibility: 'public',
        revision: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: Date.now() + 3600000 * 24 * 90,
        photos: [],
        responses_count: 0,
      };

      return {
        success: true,
        message: 'Объявление успешно создано и добавлено в каталог площадки!',
        created_listing: newListing,
      };
    }

    case 'inspect_room': {
      const room = rooms.find((r) => r.id === args.room_id) || rooms[0];
      if (!room) {
        return { error: 'Комната не найдена' };
      }
      return {
        id: room.id,
        title: room.title,
        listing_title: room.listingTitle,
        participants: room.participants,
        messages_count: room.messages.length,
        recent_messages: room.messages.slice(-4).map((m: any) => ({
          sender: m.sender,
          role: m.role,
          text: m.text,
        })),
      };
    }

    case 'send_room_message': {
      const newMsg = {
        id: 'msg-' + Date.now(),
        roomId: args.room_id,
        sender: args.sender || 'agent:mcp-assistant',
        role: 'agent',
        text: args.text,
        timestamp: Date.now(),
      };
      return {
        success: true,
        sent_message: newMsg,
      };
    }

    case 'inspect_safety_guidelines': {
      return {
        principles: [
          'Открыта для всех: город — фильтр, а не условие закрытой регистрации.',
          'Публикуете осознанно: личные заметки и прошлая переписка не становятся публичными.',
          'Личные данные — не витрина: телефон и точный адрес не светятся на сайте.',
          'Передача денег: безопасная встреча в общественном месте или наложенный платёж. Не переводите предоплату незнакомцам.',
        ],
      };
    }

    default:
      return { error: `Неизвестный инструмент: ${name}` };
  }
}

// Built-in MCP Agent Engine that executes tools directly when external Gemini API is unreachable or key is not provided
function handleLocalMcpAgent(userPrompt: string, context: { listings: any[]; rooms: any[] }) {
  const prompt = userPrompt.toLowerCase();
  const executedTools: any[] = [];
  let createdListing = null;
  let createdRoomMessage = null;
  let answerText = '';

  // 1. Creation intent
  if (
    prompt.includes('создай') ||
    prompt.includes('опубликуй') ||
    prompt.includes('выстави') ||
    prompt.includes('продам') ||
    prompt.includes('куплю') ||
    prompt.includes('подать объявление')
  ) {
    let title = userPrompt
      .replace(/^(создай|опубликуй|выстави|составь)(\s+объявление(\s+о\s+продаже|\s+о)?|\s+черновик)?/i, '')
      .trim();
    if (!title) title = 'Новое объявление пользователя';

    const priceMatch = userPrompt.match(/(\d+[\d\s]*)\s*(руб|₽|rub)/i) || userPrompt.match(/за\s+(\d+[\d\s]*)/i);
    let priceRubles = 0;
    if (priceMatch) {
      priceRubles = parseInt(priceMatch[1].replace(/\s/g, ''), 10) || 0;
    }

    let locality = 'Казань';
    if (prompt.includes('москв')) locality = 'Москва';
    else if (prompt.includes('питер') || prompt.includes('петербург')) locality = 'Санкт-Петербург';

    let category = 'things';
    if (prompt.includes('услуг') || prompt.includes('настройк') || prompt.includes('разработ') || prompt.includes('it')) {
      category = 'services';
    } else if (prompt.includes('поездк') || prompt.includes('попутчик')) {
      category = 'rides';
    } else if (prompt.includes('доставк') || prompt.includes('курьер')) {
      category = 'delivery';
    }

    const kind = prompt.includes('куплю') || prompt.includes('ищу') ? 'request' : 'offer';

    const toolArgs = {
      title: title.length > 80 ? title.substring(0, 80) : title,
      description: `Объявление оформлено через MCP-ассистента: «${userPrompt}». Точные детали, проверка и передача согласуются в защищённой комнате.`,
      category,
      kind,
      locality,
      price_rubles: priceRubles,
      modes: ['pickup', 'shipping'],
    };

    const toolResult = executeMcpTool('create_draft_listing', toolArgs, context);
    executedTools.push({
      name: 'create_draft_listing',
      args: toolArgs,
      result: toolResult,
    });
    createdListing = (toolResult as any).created_listing;

    answerText =
      `✅ Я создал и опубликовал карточку объявления на площадке:\n\n` +
      `📦 **${toolArgs.title}**\n` +
      `• Категория: ${category === 'things' ? 'Вещи' : category === 'services' ? 'Услуги' : category}\n` +
      `• Город: ${locality}\n` +
      `• Цена: ${priceRubles > 0 ? priceRubles.toLocaleString('ru-RU') + ' ₽' : 'По договорённости'}\n` +
      `• Способы передачи: Самовывоз, Доставка\n\n` +
      `Карточка успешно добавлена в каталог маркетплейса и доступна для перехода ниже.`;
  }
  // 2. Safety / Privacy intent
  else if (
    prompt.includes('безопасн') ||
    prompt.includes('приватн') ||
    prompt.includes('данн') ||
    prompt.includes('телефон') ||
    prompt.includes('адрес') ||
    prompt.includes('правил')
  ) {
    const toolResult = executeMcpTool('inspect_safety_guidelines', { topic: 'privacy' }, context);
    executedTools.push({
      name: 'inspect_safety_guidelines',
      args: { topic: 'privacy' },
      result: toolResult,
    });

    answerText =
      `🛡️ **Принципы безопасности и приватности MCP Rooms:**\n\n` +
      `1. **Личные данные — не витрина:** номер телефона и точный домашний адрес никогда не отображаются в открытом интернете. Обмен контактами происходит только по взаимному согласию участников в защищённой комнате переговоров.\n` +
      `2. **Открыта для всех:** город и регион служат фильтром для удобства поиска, а не барьером для регистрации.\n` +
      `3. **Осознанная публикация:** сначала создаётся черновик и проходит предпросмотр. Прошлая переписка никогда не попадает в публичный доступ.\n` +
      `4. **Защита сделки:** встречайтесь в безопасных общественных местах или используйте проверенные службы доставки. Не переводите предоплату незнакомцам.`;
  }
  // 3. Room inspection intent
  else if (
    prompt.includes('комнат') ||
    prompt.includes('переговор') ||
    prompt.includes('отклик') ||
    prompt.includes('сообщен')
  ) {
    const targetRoomId = context.rooms[0]?.id || 'room-bike-negotiation-01';
    const toolResult = executeMcpTool('inspect_room', { room_id: targetRoomId }, context);
    executedTools.push({
      name: 'inspect_room',
      args: { room_id: targetRoomId },
      result: toolResult,
    });

    const recent = (toolResult as any).recent_messages || [];
    const msgsStr = recent.map((m: any) => `• **${m.sender}:** ${m.text}`).join('\n');

    answerText =
      `💬 **Состояние комнаты переговоров (Shared Room):**\n` +
      `Тема: ${(toolResult as any).title || targetRoomId}\n` +
      `Всего сообщений: ${(toolResult as any).messages_count}\n\n` +
      `Последние сообщения в изолированном контексте:\n${msgsStr || 'Сообщений пока нет'}\n\n` +
      `Вы можете отправлять новые сообщения продавцу через кнопку связи на карточке или в MCP-консоли.`;
  }
  // 4. Listing search intent
  else {
    let locality = '';
    if (prompt.includes('казан')) locality = 'Казань';
    else if (prompt.includes('москв')) locality = 'Москва';
    else if (prompt.includes('питер') || prompt.includes('петербург')) locality = 'Санкт-Петербург';

    let category = '';
    if (prompt.includes('вещ') || prompt.includes('велосипед') || prompt.includes('товар')) category = 'things';
    else if (prompt.includes('услуг') || prompt.includes('it') || prompt.includes('разработ')) category = 'services';
    else if (prompt.includes('поездк') || prompt.includes('попутчик')) category = 'rides';
    else if (prompt.includes('доставк') || prompt.includes('курьер')) category = 'delivery';

    const cleanQuery = userPrompt
      .replace(/найди|покажи|какие|есть|в\s+городе|в\s+казани|в\s+москве|на\s+площадке/gi, '')
      .trim();

    const toolArgs = {
      query: cleanQuery || undefined,
      category: category || undefined,
      locality: locality || undefined,
    };

    const toolResult = executeMcpTool('list_active_listings', toolArgs, context);
    executedTools.push({
      name: 'list_active_listings',
      args: toolArgs,
      result: toolResult,
    });

    const items = (toolResult as any).items || [];
    if (items.length > 0) {
      const itemsList = items
        .map(
          (it: any, i: number) =>
            `${i + 1}. **${it.title}**\n` +
            `   • Цена: ${typeof it.price_rub === 'number' ? it.price_rub.toLocaleString('ru-RU') + ' ₽' : it.price_rub}\n` +
            `   • Локация: ${it.locality || 'Любая'} (${it.modes.join(', ')})\n` +
            `   • Автор: ${it.author}`
        )
        .join('\n\n');

      answerText = `🔍 По вашему запросу найдено ${items.length} активных объявлений через MCP:\n\n${itemsList}\n\nВы можете открыть любое из них в каталоге или уточнить параметры поиска.`;
    } else {
      answerText = `По запросу «${userPrompt}» объявлений пока нет. Попробуйте поискать велосипеды в Казани, IT-консультации или создать собственное объявление с помощью кнопки выше!`;
    }
  }

  return {
    text: answerText,
    executedTools,
    createdListing,
    createdRoomMessage,
  };
}

// POST /api/chat - Multi-turn conversational chat with Gemini connected to MCP tools
app.post('/api/chat', async (req, res) => {
  const { messages, contextListings = [], contextRooms = [], model = 'gemini-3.8-flash' } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Параметр messages обязателен и должен быть массивом' });
    return;
  }

  const userPrompt = messages[messages.length - 1]?.content || '';
  const context = { listings: contextListings, rooms: contextRooms };
  const aiClient = getGenAiClient();

  // If no Gemini API key is configured in the environment, use the local MCP Agent engine directly
  if (!aiClient) {
    const fallbackResponse = handleLocalMcpAgent(userPrompt, context);
    res.json(fallbackResponse);
    return;
  }

  try {
    // Convert messages into Gemini format
    const contents: any[] = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const systemInstruction = `Ты — официальный AI-ассистент маркетплейса «Хочу · Предлагаю» (MCP Rooms).
Твоя цель — помогать людям и AI-агентам комфортно взаимодействовать на площадке:
1. Искать и подбирать объявления (товары, услуги, доставка, поездки) с помощью инструмента list_active_listings.
2. Предоставлять точную информацию о деталях объявлений через get_listing_details.
3. Помогать составлять и публиковать новые объявления через create_draft_listing, когда пользователь об этом просит.
4. Отвечать на вопросы о правилах безопасности, самовывозе и приватности площадки (телефон и домашний адрес никогда не публикуются).
5. Работать с комнатами переговоров (Shared Rooms) через inspect_room и send_room_message.

Всегда общайся вежливо, по делу, структурированно, на русском языке.
Если пользователь просит найти что-то или создать объявление, обязательно используй доступные MCP-инструменты!`;

    // 1st turn: model generation with MCP tools
    const response = await aiClient.models.generateContent({
      model: model,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        tools: [{ functionDeclarations: mcpTools }],
      },
    });

    const functionCalls = response.functionCalls;
    const executedTools: any[] = [];
    let createdListing = null;
    let createdRoomMessage = null;

    // If model decided to invoke MCP tools
    if (functionCalls && functionCalls.length > 0) {
      const toolCall = functionCalls[0];
      const toolName = toolCall.name || '';
      const toolResult = executeMcpTool(toolName, toolCall.args || {}, context);

      executedTools.push({
        name: toolName,
        args: toolCall.args,
        result: toolResult,
      });

      if (toolName === 'create_draft_listing' && (toolResult as any).created_listing) {
        createdListing = (toolResult as any).created_listing;
      }
      if (toolName === 'send_room_message' && (toolResult as any).sent_message) {
        createdRoomMessage = (toolResult as any).sent_message;
      }

      // Feed tool response back to the model for final answer
      const modelCandidate = response.candidates?.[0]?.content;
      const followUpContents = [
        ...contents,
        modelCandidate || { role: 'model', parts: [{ text: '' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: { result: toolResult },
              },
            },
          ],
        },
      ];

      const followUpResponse = await aiClient.models.generateContent({
        model: model,
        contents: followUpContents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
          tools: [{ functionDeclarations: mcpTools }],
        },
      });

      res.json({
        text: followUpResponse.text || 'Операция MCP успешно выполнена.',
        executedTools,
        createdListing,
        createdRoomMessage,
      });
      return;
    }

    res.json({
      text: response.text || '',
      executedTools: [],
      createdListing: null,
      createdRoomMessage: null,
    });
  } catch (_err: any) {
    // If the API key is invalid or external API call fails, switch to local MCP Agent engine silently
    isGeminiKeyFunctional = false;
    const fallbackResponse = handleLocalMcpAgent(userPrompt, context);
    res.json(fallbackResponse);
  }
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MCP Rooms fullstack server running on http://0.0.0.0:${PORT}`);
  });
}

start();
