import DatabaseModule from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const Database = (DatabaseModule as any).default || DatabaseModule;

// Ensure data directory exists for persistent SQLite database on disk
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'mcp_rooms.db');
export const db = new Database(dbPath);

// Enable WAL mode for high performance and concurrency
db.pragma('journal_mode = WAL');

// Initialize database schema
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      author_name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      kind TEXT NOT NULL, -- 'offer' or 'request'
      modes TEXT NOT NULL, -- JSON array of ['pickup', 'shipping', 'online']
      locality TEXT NOT NULL,
      region TEXT,
      country TEXT,
      price_minor INTEGER, -- null for negotiable, otherwise minor currency unit (e.g. kopecks)
      currency TEXT NOT NULL DEFAULT 'RUB',
      condition TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- 'draft', 'active', 'paused', 'fulfilled', 'archived'
      visibility TEXT NOT NULL DEFAULT 'public',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      photos_json TEXT NOT NULL DEFAULT '[]',
      responses_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      listing_id TEXT,
      listing_title TEXT,
      participants_json TEXT NOT NULL, -- JSON array of principal strings
      status TEXT NOT NULL DEFAULT 'active', -- 'active' or 'closed'
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      role TEXT NOT NULL, -- 'human', 'agent', 'system'
      text TEXT NOT NULL,
      tool_call_json TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS negotiations (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      listing_id TEXT,
      user_goal TEXT NOT NULL,
      initiator_agent TEXT NOT NULL,
      counterpart_agent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'agreed', 'declined'
      rounds_json TEXT NOT NULL DEFAULT '[]',
      agreed_terms_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );
  `);

  // Seed default data if database is empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM listings').get() as { cnt: number };
  if (count.cnt === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const insertListing = db.prepare(`
    INSERT INTO listings (
      id, owner, author_name, title, description, category, subcategory,
      kind, modes, locality, region, country, price_minor, currency, condition,
      status, visibility, revision, created_at, updated_at, expires_at, photos_json, responses_count
    ) VALUES (
      @id, @owner, @author_name, @title, @description, @category, @subcategory,
      @kind, @modes, @locality, @region, @country, @price_minor, @currency, @condition,
      @status, @visibility, @revision, @created_at, @updated_at, @expires_at, @photos_json, @responses_count
    )
  `);

  const now = Date.now();

  const seedItems = [
    // 1. Business / Партнёрство
    {
      id: 'biz-partner-ai-01',
      owner: 'user:founder-alex',
      author_name: 'Алексей (Технический фаундер)',
      title: 'Ищу кофаундера / бизнес-партнёра в B2B AI-стартап (MCP & автоматизация)',
      description:
        'Разрабатываем платформу интеграции локальных LLM-агентов с CRM и складскими базами данных. Продукт на стадии работающего MVP с первыми 3 платными пилотами. Ищу сильного коммерческого партнёра (маркетинг, продажи B2B, привлечение pre-seed раунда). Доля в компании обсуждается на переговорах.',
      category: 'business',
      subcategory: 'Партнёрство и стартапы',
      kind: 'offer',
      modes: JSON.stringify(['online']),
      locality: 'Казань',
      region: 'Татарстан',
      country: 'Россия',
      price_minor: null, // Договорная (Equity)
      currency: 'RUB',
      condition: 'Стадия MVP с подтверждённым спросом',
      status: 'active',
      visibility: 'public',
      revision: 1,
      created_at: now - 3600000 * 48,
      updated_at: now - 3600000 * 10,
      expires_at: now + 3600000 * 24 * 90,
      photos_json: '[]',
      responses_count: 3,
    },
    // 2. Jobs / Вакансии
    {
      id: 'job-dev-senior-02',
      owner: 'user:hr-lead-tech',
      author_name: 'TechFin Solutions',
      title: 'Senior TypeScript / Node.js Backend Engineer (MCP & AI Agents)',
      description:
        'Ищем ведущего бэкенд-инженера для масштабирования высоконагруженного шлюза агентных протоколов. Стек: Node.js 22, TypeScript, SQLite/PostgreSQL, Docker, WebSocket. Удалённый формат работы или гибрид в Казани/Москве. Белая зарплата 280 000 – 350 000 ₽ на руки, ДМС и техника.',
      category: 'jobs',
      subcategory: 'IT и разработка',
      kind: 'offer',
      modes: JSON.stringify(['online', 'pickup']),
      locality: 'Казань',
      region: 'Татарстан',
      country: 'Россия',
      price_minor: 32000000, // 320 000 ₽
      currency: 'RUB',
      condition: 'Full-time, удалённо или офис',
      status: 'active',
      visibility: 'public',
      revision: 1,
      created_at: now - 3600000 * 30,
      updated_at: now - 3600000 * 4,
      expires_at: now + 3600000 * 24 * 60,
      photos_json: '[]',
      responses_count: 5,
    },
    // 3. Services / Ремонт и услуги
    {
      id: 'service-plumbing-bath-03',
      owner: 'user:master-marat',
      author_name: 'Марат (Мастер сантехники)',
      title: 'Комплексный ремонт санузлов, замена сантехники и труб под ключ',
      description:
        'Опыт работы 12 лет. Выполняю монтаж коллекторных разводок Rehau/Stout, установку инсталляций, ванн, душевых трапов и чистовой сантехники. Договор, гарантия 3 года. Смета фиксируется до начала работ. Выезд на замер по Казани бесплатный при согласовании заказа.',
      category: 'services',
      subcategory: 'Ремонт и отделка',
      kind: 'offer',
      modes: JSON.stringify(['pickup']),
      locality: 'Казань',
      region: 'Татарстан',
      country: 'Россия',
      price_minor: 3500000, // 35 000 ₽
      currency: 'RUB',
      condition: 'Профессиональное оборудование, договор и гарантия',
      status: 'active',
      visibility: 'public',
      revision: 1,
      created_at: now - 3600000 * 20,
      updated_at: now - 3600000 * 2,
      expires_at: now + 3600000 * 24 * 75,
      photos_json: '[]',
      responses_count: 2,
    },
    // 4. Dating / Знакомства и общение
    {
      id: 'dating-hike-kazan-04',
      owner: 'user:daria-nature',
      author_name: 'Дарья (26 лет)',
      title: 'Ищу компанию для походов в горы, велопрогулок по Волге и настольных игр',
      description:
        'Привет! Люблю активный отдых на природе, походы с палатками по Камскому Устью и Марий Эл, велозаезды по выходным и уютные вечера за настолками. Ищу близких по духу людей для совместных выездов и душевного общения. Не люблю пустые переписки — за реальные встречи и совместные активности!',
      category: 'dating',
      subcategory: 'Спорт и активный отдых',
      kind: 'offer',
      modes: JSON.stringify(['pickup', 'online']),
      locality: 'Казань',
      region: 'Татарстан',
      country: 'Россия',
      price_minor: null, // Бесплатно / совместные расходы
      currency: 'RUB',
      condition: 'Дружба, общение и совместные хобби',
      status: 'active',
      visibility: 'public',
      revision: 1,
      created_at: now - 3600000 * 18,
      updated_at: now - 3600000 * 1,
      expires_at: now + 3600000 * 24 * 40,
      photos_json: '[]',
      responses_count: 4,
    },
    // 5. Things / Товары
    {
      id: 'bike-kazan-demo-01',
      owner: 'user:kazan-cyclist',
      author_name: 'Будущий автор объявления',
      title: 'Городской велосипед, размер M',
      description:
        'Пример оформления объявления. Городской велосипед для повседневных поездок. Здесь продавец расскажет о состоянии, комплектации и причинах продажи. Рама алюминиевая, 7 скоростей Shimano Nexus, планетарная втулка, полноразмерные крылья и багажник.',
      category: 'things',
      subcategory: 'Велосипеды',
      kind: 'offer',
      modes: JSON.stringify(['pickup', 'shipping']),
      locality: 'Казань',
      region: 'Татарстан',
      country: 'Россия',
      price_minor: 2800000, // 28 000 ₽
      currency: 'RUB',
      condition: 'Хорошее, бережная эксплуатация',
      status: 'active',
      visibility: 'public',
      revision: 1,
      created_at: now - 3600000 * 24 * 2,
      updated_at: now - 3600000 * 2,
      expires_at: now + 3600000 * 24 * 88,
      photos_json: '[]',
      responses_count: 2,
    },
    // 6. Rides / Поездки
    {
      id: 'ride-kazan-chelny-05',
      owner: 'user:driver-artur',
      author_name: 'Артур К.',
      title: 'Поездка Казань → Набережные Челны (3 свободных места)',
      description:
        'Выезжаю в пятницу в 18:30 от метро Проспект Победы. Чистый салон, кондиционер, просторный багажник. Перевезу попутчиков или небольшие посылки.',
      category: 'rides',
      subcategory: 'Межгород',
      kind: 'offer',
      modes: JSON.stringify(['pickup']),
      locality: 'Казань',
      region: 'Татарстан',
      country: 'Россия',
      price_minor: 75000, // 750 ₽
      currency: 'RUB',
      condition: 'Комфорт-класс',
      status: 'active',
      visibility: 'public',
      revision: 1,
      created_at: now - 3600000 * 14,
      updated_at: now - 3600000 * 4,
      expires_at: now + 3600000 * 24 * 10,
      photos_json: '[]',
      responses_count: 2,
    },
    // 7. Delivery / Доставка
    {
      id: 'delivery-express-06',
      owner: 'user:fast-courier',
      author_name: 'Служба бережной доставки',
      title: 'Срочная доставка документов и малогабаритных грузов по городу',
      description:
        'Быстрая доставка от двери до двери. Фотоотчёт о вручении, аккуратное обращение с хрупкими вещами. Оплата по факту вручения адресату.',
      category: 'delivery',
      subcategory: 'Курьеры',
      kind: 'offer',
      modes: JSON.stringify(['pickup', 'shipping']),
      locality: 'Казань',
      region: 'Татарстан',
      country: 'Россия',
      price_minor: 50000, // 500 ₽
      currency: 'RUB',
      condition: 'Срочно в день заказа',
      status: 'active',
      visibility: 'public',
      revision: 1,
      created_at: now - 3600000 * 6,
      updated_at: now - 3600000 * 1,
      expires_at: now + 3600000 * 24 * 45,
      photos_json: '[]',
      responses_count: 1,
    },
  ];

  const insertMany = db.transaction((items: any[]) => {
    for (const item of items) insertListing.run(item);
  });
  insertMany(seedItems);

  // Seed sample rooms and messages
  const insertRoom = db.prepare(`
    INSERT INTO rooms (id, listing_id, listing_title, participants_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertRoom.run(
    'room-bike-negotiation-01',
    'bike-kazan-demo-01',
    'Городской велосипед, размер M',
    JSON.stringify(['user:buyer-77', 'user:kazan-cyclist', 'agent:mcp-angel']),
    'active',
    now - 3600000 * 5,
    now - 3600000 * 1
  );

  const insertMessage = db.prepare(`
    INSERT INTO messages (id, room_id, sender, role, text, tool_call_json, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertMessage.run(
    'msg-1',
    'room-bike-negotiation-01',
    'user:buyer-77',
    'human',
    'Здравствуйте! Подскажите, какой точный вес у велосипеда и проводилось ли ТО в этом сезоне?',
    null,
    now - 3600000 * 5
  );
  insertMessage.run(
    'msg-2',
    'room-bike-negotiation-01',
    'user:kazan-cyclist',
    'human',
    'Добрый день! Вес около 13.8 кг, в начале сезона смазали цепь и настроили планетарную втулку. Готов показать возле парка Горького.',
    null,
    now - 3600000 * 3
  );
  insertMessage.run(
    'msg-3',
    'room-bike-negotiation-01',
    'agent:mcp-angel',
    'agent',
    'Агент-Ангел: Проверил параметры объявления. Самовывоз в Казани подтверждён обеими сторонами. Напоминаю: безопасная встреча в публичном месте рекомендуется правилами площадки.',
    JSON.stringify({
      tool: 'inspect_room_agreement',
      params: { roomId: 'room-bike-negotiation-01', mode: 'pickup' },
      result: { ok: true, matched_terms: ['pickup', 'kazan'] },
    }),
    now - 3600000 * 2
  );
}

// Database helper functions
export function getListingsFromDb(filters: {
  category?: string;
  kind?: string;
  locality?: string;
  query?: string;
}) {
  let sql = 'SELECT * FROM listings WHERE status = "active"';
  const params: any[] = [];

  if (filters.category && filters.category !== 'all') {
    sql += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters.kind && filters.kind !== 'all') {
    sql += ' AND kind = ?';
    params.push(filters.kind);
  }
  if (filters.locality && filters.locality !== 'all') {
    sql += ' AND LOWER(locality) LIKE ?';
    params.push(`%${filters.locality.toLowerCase()}%`);
  }
  if (filters.query && filters.query.trim()) {
    const q = `%${filters.query.toLowerCase().trim()}%`;
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(subcategory) LIKE ?)';
    params.push(q, q, q);
  }

  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map(formatListingRow);
}

export function getListingByIdFromDb(id: string) {
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as any;
  return row ? formatListingRow(row) : null;
}

export function createListingInDb(listing: any) {
  const stmt = db.prepare(`
    INSERT INTO listings (
      id, owner, author_name, title, description, category, subcategory,
      kind, modes, locality, region, country, price_minor, currency, condition,
      status, visibility, revision, created_at, updated_at, expires_at, photos_json, responses_count
    ) VALUES (
      @id, @owner, @author_name, @title, @description, @category, @subcategory,
      @kind, @modes, @locality, @region, @country, @price_minor, @currency, @condition,
      @status, @visibility, @revision, @created_at, @updated_at, @expires_at, @photos_json, @responses_count
    )
  `);

  const modesStr = Array.isArray(listing.content.modes)
    ? JSON.stringify(listing.content.modes)
    : listing.content.modes;

  const photosStr = Array.isArray(listing.photos)
    ? JSON.stringify(listing.photos)
    : '[]';

  stmt.run({
    id: listing.id,
    owner: listing.owner,
    author_name: listing.author_name,
    title: listing.content.title,
    description: listing.content.description,
    category: listing.content.category,
    subcategory: listing.content.subcategory || null,
    kind: listing.content.kind,
    modes: modesStr,
    locality: listing.content.locality,
    region: listing.content.region || null,
    country: listing.content.country || null,
    price_minor: listing.content.price_minor,
    currency: listing.content.currency || 'RUB',
    condition: listing.content.condition || null,
    status: listing.status || 'active',
    visibility: listing.visibility || 'public',
    revision: listing.revision || 1,
    created_at: listing.created_at || Date.now(),
    updated_at: listing.updated_at || Date.now(),
    expires_at: listing.expires_at || Date.now() + 3600000 * 24 * 90,
    photos_json: photosStr,
    responses_count: listing.responses_count || 0,
  });

  return getListingByIdFromDb(listing.id);
}

export function getRoomsFromDb() {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY updated_at DESC').all() as any[];
  return rooms.map((r) => {
    const messages = db
      .prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp ASC')
      .all(r.id) as any[];

    return {
      id: r.id,
      listingId: r.listing_id,
      listingTitle: r.listing_title,
      participants: JSON.parse(r.participants_json || '[]'),
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      messages: messages.map((m) => ({
        id: m.id,
        roomId: m.room_id,
        sender: m.sender,
        role: m.role,
        text: m.text,
        toolCall: m.tool_call_json ? JSON.parse(m.tool_call_json) : undefined,
        timestamp: m.timestamp,
      })),
    };
  });
}

export function getRoomByIdFromDb(id: string) {
  const r = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as any;
  if (!r) return null;

  const messages = db
    .prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp ASC')
    .all(r.id) as any[];

  return {
    id: r.id,
    listingId: r.listing_id,
    listingTitle: r.listing_title,
    participants: JSON.parse(r.participants_json || '[]'),
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    messages: messages.map((m) => ({
      id: m.id,
      roomId: m.room_id,
      sender: m.sender,
      role: m.role,
      text: m.text,
      toolCall: m.tool_call_json ? JSON.parse(m.tool_call_json) : undefined,
      timestamp: m.timestamp,
    })),
  };
}

export function createRoomInDb(room: {
  id: string;
  listingId?: string;
  listingTitle?: string;
  participants: string[];
}) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO rooms (id, listing_id, listing_title, participants_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(
    room.id,
    room.listingId || null,
    room.listingTitle || null,
    JSON.stringify(room.participants),
    now,
    now
  );
  return getRoomByIdFromDb(room.id);
}

export function addMessageToRoomInDb(message: {
  id: string;
  roomId: string;
  sender: string;
  role: string;
  text: string;
  toolCall?: any;
  timestamp?: number;
}) {
  const now = message.timestamp || Date.now();
  db.prepare(`
    INSERT INTO messages (id, room_id, sender, role, text, tool_call_json, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    message.roomId,
    message.sender,
    message.role,
    message.text,
    message.toolCall ? JSON.stringify(message.toolCall) : null,
    now
  );

  db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(now, message.roomId);
}

export function saveNegotiationInDb(negotiation: {
  id: string;
  roomId: string;
  listingId?: string;
  userGoal: string;
  initiatorAgent: string;
  counterpartAgent: string;
  status: string;
  rounds: any[];
  agreedTerms?: any;
}) {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO negotiations (
      id, room_id, listing_id, user_goal, initiator_agent, counterpart_agent,
      status, rounds_json, agreed_terms_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    negotiation.id,
    negotiation.roomId,
    negotiation.listingId || null,
    negotiation.userGoal,
    negotiation.initiatorAgent,
    negotiation.counterpartAgent,
    negotiation.status,
    JSON.stringify(negotiation.rounds),
    negotiation.agreedTerms ? JSON.stringify(negotiation.agreedTerms) : null,
    now,
    now
  );
}

export function getNegotiationsFromDb() {
  const rows = db.prepare('SELECT * FROM negotiations ORDER BY updated_at DESC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    listingId: r.listing_id,
    userGoal: r.user_goal,
    initiatorAgent: r.initiator_agent,
    counterpartAgent: r.counterpart_agent,
    status: r.status,
    rounds: JSON.parse(r.rounds_json || '[]'),
    agreedTerms: r.agreed_terms_json ? JSON.parse(r.agreed_terms_json) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

function formatListingRow(row: any) {
  let modes: string[] = [];
  try {
    modes = JSON.parse(row.modes);
  } catch {
    modes = ['pickup'];
  }

  let photos: any[] = [];
  try {
    photos = JSON.parse(row.photos_json);
  } catch {
    photos = [];
  }

  return {
    id: row.id,
    owner: row.owner,
    author_name: row.author_name,
    content: {
      title: row.title,
      description: row.description,
      category: row.category,
      subcategory: row.subcategory || undefined,
      kind: row.kind,
      modes,
      locality: row.locality,
      region: row.region || undefined,
      country: row.country || undefined,
      price_minor: row.price_minor,
      currency: row.currency,
      media_ids: photos.map((p: any) => p.id),
      condition: row.condition || undefined,
    },
    status: row.status,
    visibility: row.visibility,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
    photos,
    responses_count: row.responses_count,
  };
}
