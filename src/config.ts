export type Channel = 'backend' | 'ai' | 'security' | 'paper';

export interface Source {
  name: string;
  type: 'rss' | 'papers';
  url: string;
  channel: Channel;
  enabled: boolean;
}

const rss = (name: string, url: string, channel: Channel, enabled = true): Source => ({
  name,
  type: 'rss',
  url,
  channel,
  enabled,
});

/** Engineering blog của các công ty/tổ chức lớn (nguồn: tuan3w/awesome-tech-rss) và blog chính thức của stack. Không có blog cá nhân/newsletter. */
const BLOGS: Source[] = [
  // ---- Backend / hạ tầng ----
  rss('Cloudflare', 'https://blog.cloudflare.com/rss/', 'backend'),
  rss('Netflix Tech', 'https://netflixtechblog.com/feed', 'backend'),
  rss('Engineering at Meta', 'https://engineering.fb.com/feed/', 'backend'),
  rss('GitHub Engineering', 'https://github.blog/engineering/feed/', 'backend'),
  rss('Stripe', 'https://stripe.com/blog/feed.rss', 'backend'),
  rss('Slack Engineering', 'https://slack.engineering/feed', 'backend'),
  rss('Dropbox Tech', 'https://dropbox.tech/feed', 'backend'),
  rss('Spotify Engineering', 'https://engineering.atspotify.com/feed/', 'backend'),
  rss('Shopify Engineering', 'https://shopifyengineering.myshopify.com/blogs/engineering.atom', 'backend'),
  rss('Airbnb Tech (Medium)', 'https://medium.com/feed/airbnb-engineering', 'backend'),
  rss('Discord', 'https://discord.com/blog/rss.xml', 'backend'),
  rss('AWS Architecture', 'https://aws.amazon.com/blogs/architecture/feed/', 'backend'),
  rss('Grab Tech', 'https://engineering.grab.com/feed.xml', 'backend'),
  rss('Pinterest Engineering (Medium)', 'https://medium.com/feed/pinterest-engineering', 'backend'),
  rss('eBay Tech', 'http://www.ebaytechblog.com/feed/', 'backend'),
  rss('Airtable Engineering (Medium)', 'https://medium.com/feed/airtable-eng', 'backend'),
  rss('Medium Engineering', 'https://medium.com/feed/medium-eng', 'backend'),
  rss('Canva Engineering', 'https://www.canva.dev/blog/engineering/feed.xml', 'backend'),
  rss('Redis', 'https://redis.io/blog/feed/', 'backend'),
  rss('Signal', 'https://signal.org/blog/rss.xml', 'backend'),

  // ---- Stack chính thức (Java / Kotlin / Go) ----
  rss('Spring', 'https://spring.io/blog.atom', 'backend'),
  rss('Kotlin (JetBrains)', 'https://blog.jetbrains.com/kotlin/feed/', 'backend'),
  rss('Go', 'https://go.dev/blog/feed.atom', 'backend'),

  // ---- Java / Kotlin / Go / Zig / Rust (blog chính thức) ----
  rss('Inside Java (OpenJDK)', 'https://inside.java/feed.xml', 'backend'),
  rss('Quarkus', 'https://quarkus.io/feed.xml', 'backend'),
  rss('Foojay (Java community)', 'https://foojay.io/feed/', 'backend'),
  rss('Ktor', 'https://blog.jetbrains.com/ktor/feed/', 'backend'),
  rss('Zig News', 'https://ziglang.org/news/index.xml', 'backend'),
  rss('Zig Devlog', 'https://ziglang.org/devlog/index.xml', 'backend'),
  rss('Rust', 'https://blog.rust-lang.org/feed.xml', 'backend'),

  // ---- Vert.x ----
  rss('Vert.x blog', 'https://vertx.io/feed/atom.xml', 'backend'),
  rss('Vert.x releases', 'https://github.com/eclipse-vertx/vert.x/releases.atom', 'backend'),

  // ---- gRPC / Protobuf / API ----
  rss('gRPC', 'https://grpc.io/blog/index.xml', 'backend'),
  rss('Buf (Protobuf)', 'https://buf.build/blog/rss.xml', 'backend'),

  // ---- Dữ liệu / streaming ----
  rss('Debezium', 'https://debezium.io/blog.atom', 'backend'),
  rss('Redpanda', 'https://www.redpanda.com/blog/rss.xml', 'backend'),
  rss('PlanetScale', 'https://planetscale.com/blog/feed.atom', 'backend'),
  rss('ClickHouse', 'https://clickhouse.com/rss.xml', 'backend'),
  rss('Planet PostgreSQL', 'https://planet.postgresql.org/rss20.xml', 'backend'),

  // ---- Hạ tầng / observability ----
  rss('Kubernetes', 'https://kubernetes.io/feed.xml', 'backend'),
  rss('OpenTelemetry', 'https://opentelemetry.io/blog/index.xml', 'backend'),
  rss('Grafana', 'https://grafana.com/blog/index.xml', 'backend'),
  rss('Fly.io', 'https://fly.io/blog/feed.xml', 'backend'),

  // ---- Engineering blog công ty ----
  rss('Lyft Engineering', 'https://eng.lyft.com/feed', 'backend'),
  rss('Instacart', 'https://tech.instacart.com/feed', 'backend'),
  rss('Figma', 'https://www.figma.com/blog/feed/atom.xml', 'backend'),
  rss('Etsy Code as Craft', 'https://www.etsy.com/codeascraft/rss', 'backend'),
  rss('LY Corp (LINE)', 'https://techblog.lycorp.co.jp/en/feed/index.xml', 'backend'),

  // ---- Cơ sở dữ liệu / cloud / DevOps (thêm sau, đã kiểm tra feed còn hoạt động) ----
  rss('MongoDB', 'https://www.mongodb.com/blog/rss', 'backend'),
  rss('Elastic', 'https://www.elastic.co/blog/feed', 'backend'),
  rss('Percona', 'https://www.percona.com/blog/feed/', 'backend'),
  rss('Neon (Postgres)', 'https://neon.tech/blog/rss.xml', 'backend'),
  rss('Supabase', 'https://supabase.com/rss.xml', 'backend'),
  rss('Google Cloud Databases', 'https://cloudblog.withgoogle.com/products/databases/rss/', 'backend'),
  rss('AWS Database', 'https://aws.amazon.com/blogs/database/feed/', 'backend'),
  rss('AWS Compute', 'https://aws.amazon.com/blogs/compute/feed/', 'backend'),
  rss('AWS Open Source', 'https://aws.amazon.com/blogs/opensource/feed/', 'backend'),
  rss('Datadog', 'https://www.datadoghq.com/blog/index.xml', 'backend'),
  rss('HashiCorp', 'https://www.hashicorp.com/blog/feed.xml', 'backend'),
  rss('Docker', 'https://www.docker.com/feed/', 'backend'),

  // ---- Engineering blog công ty / kiến trúc / Java ----
  rss('Zalando Engineering', 'https://engineering.zalando.com/atom.xml', 'backend'),
  rss('Booking.com (Medium)', 'https://medium.com/feed/booking-com-development', 'backend'),
  rss('Atlassian Engineering', 'https://www.atlassian.com/engineering/feed', 'backend'),
  rss('Sourcegraph', 'https://sourcegraph.com/blog/rss.xml', 'backend'),
  rss('Martin Fowler', 'https://martinfowler.com/feed.atom', 'backend'),
  rss('Baeldung', 'https://www.baeldung.com/feed', 'backend'),
  rss('Vlad Mihalcea (JPA/Hibernate)', 'https://vladmihalcea.com/feed/', 'backend'),

  // ---- Bảo mật / CVE / lỗ hổng ----
  rss('Spring Security Advisories', 'https://spring.io/security.atom', 'security'),
  rss('Kubernetes CVE feed', 'https://kubernetes.io/docs/reference/issues-security/official-cve-feed/feed.xml', 'security'),
  rss('AWS Security Bulletins', 'https://aws.amazon.com/security/security-bulletins/feed/', 'security'),
  rss('CISA Advisories', 'https://www.cisa.gov/cybersecurity-advisories/all.xml', 'security'),
  rss('Project Zero', 'https://googleprojectzero.blogspot.com/feeds/posts/default', 'security'),
  rss('Google Security Blog', 'https://security.googleblog.com/feeds/posts/default', 'security'),
  rss('Socket.dev (supply chain)', 'https://socket.dev/api/blog/feed.atom', 'security'),
  rss('Trail of Bits', 'https://blog.trailofbits.com/feed/', 'security'),
  rss('PortSwigger Research', 'https://portswigger.net/research/rss', 'security'),
  rss('Krebs on Security', 'https://krebsonsecurity.com/feed/', 'security'),
  rss('Kaspersky Securelist', 'https://securelist.com/feed/', 'security'),

  // ---- AI ----
  rss('OpenAI Engineering', 'https://openai.com/news/engineering/rss.xml', 'ai'),
  rss('Google Research', 'https://research.google/blog/rss/', 'ai'),
  rss('DeepMind', 'https://deepmind.com/blog/feed/basic/', 'ai'),
  rss('Nvidia Developer', 'https://developer.nvidia.com/blog/feed', 'ai'),
  rss('PyTorch', 'https://pytorch.org/feed', 'ai'),
  rss('Amazon Science', 'https://www.amazon.science/index.rss', 'ai'),
];

/** Hội nghị lấy paper (mã OpenAlex; một hội nghị có thể có nhiều mã). Nhóm cuối chưa có dữ liệu mới trong OpenAlex nên để sẵn. */
export const PAPER_VENUES: Record<string, string[]> = {
  VLDB: ['S4210226185'],
  SIGMOD: ['S4393915683', 'S4387289859'], // hội nghị + PACMMOD
  ICDE: ['S4210210321'],
  SOSP: ['S7407089168'],
  EuroSys: ['S4306418317'],
  ASPLOS: ['S7407086669'],
  SIGCOMM: ['S7407086014'],
  STOC: ['S7407087723'],
  FOCS: ['S4210175768'],
  // chưa có dữ liệu mới trong OpenAlex (kiểm tra 11/2026):
  NSDI: ['S4306420602'],
  'USENIX ATC': ['S4306421113'],
  FAST: ['S4306418422'],
  SoCC: ['S7407088165', 'S4306420965'],
  CIDR: ['S4306418070'],
  PODC: ['S7407086807'],
  SODA: ['S4306420974', 'S4363608728'],
};
/** Công ty (mã OpenAlex, gồm đơn vị con). Cloudflare không có trong OpenAlex. */
export const PAPER_COMPANIES: Record<string, string> = {
  Google: 'I1291425158',
  'Google DeepMind': 'I4210090411',
  Meta: 'I4210114444',
  'Microsoft Research Asia': 'I4210113369',
  'Microsoft Research UK': 'I4210164937',
  Amazon: 'I1311688040',
  Netflix: 'I869089601',
  'Uber AI': 'I2946016260',
  LinkedIn: 'I1316064682',
  Alibaba: 'I45928872',
  ByteDance: 'I4405256866',
  Databricks: 'I4401726825',
  Snowflake: 'I4400600931',
};
export const PAPER_WINDOW_DAYS = 365;

// Cần secret OPENALEX_API_KEY: không có khoá thì OpenAlex hay trả 429 từ IP Cloudflare dùng chung.
/** Tên miền để lấy logo khi khác tên miền gốc của feed (blog nằm trên Medium/GitHub, logo công ty ở tên miền khác) và logo hội nghị cho paper. */
const SITE_OVERRIDES: Record<string, string> = {
  'Engineering at Meta': 'meta.com',
  'Instagram Engineering (Meta)': 'instagram.com', // nguồn đã gỡ (trùng feed Meta) nhưng các bài đã lưu vẫn mang nhãn này
  'GitHub Engineering': 'github.com',
  'Spotify Engineering': 'spotify.com',
  'Shopify Engineering': 'shopify.com',
  'Dropbox Tech': 'dropbox.com',
  'Airbnb Tech (Medium)': 'airbnb.com',
  'Pinterest Engineering (Medium)': 'pinterest.com',
  'Airtable Engineering (Medium)': 'airtable.com',
  'Booking.com (Medium)': 'booking.com',
  'eBay Tech': 'ebay.com',
  'Canva Engineering': 'canva.com',
  'Kotlin (JetBrains)': 'kotlinlang.org',
  Ktor: 'ktor.io',
  'Inside Java (OpenJDK)': 'openjdk.org',
  'Vert.x releases': 'vertx.io',
  'LY Corp (LINE)': 'line.me',
  'Google Cloud Databases': 'cloud.google.com',
  'Google Security Blog': 'google.com',
  'Project Zero': 'google.com',
  'Google Research': 'google.com',
  'Kaspersky Securelist': 'kaspersky.com',
  'AWS Architecture': 'aws.amazon.com',
  'AWS Database': 'aws.amazon.com',
  'AWS Compute': 'aws.amazon.com',
  'AWS Open Source': 'aws.amazon.com',
  'AWS Security Bulletins': 'aws.amazon.com',
  VLDB: 'vldb.org',
  SIGMOD: 'sigmod.org',
  ICDE: 'ieee.org',
  SOSP: 'sigops.org',
  EuroSys: 'eurosys.org',
  ASPLOS: 'asplos-conference.org',
  SIGCOMM: 'sigcomm.org',
  STOC: 'sigact.org',
  FOCS: 'ieee-focs.org',
};

/** Tên miền gốc của một host (bỏ www/blog/engineering…; giữ 3 nhãn cho đuôi kiểu co.jp). */
const rootDomain = (host: string): string => {
  const labels = host.replace(/^www\./, '').split('.');
  const n = labels.length > 2 && labels.at(-1)!.length === 2 && ['co', 'com', 'org', 'ac'].includes(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-n).join('.');
};

/** Nguồn → tên miền dùng lấy logo (trang web hiển thị logo công ty thay cho chữ cái đầu). */
export const SITE_OF: Record<string, string> = {
  ...Object.fromEntries(BLOGS.map((b) => [b.name, rootDomain(new URL(b.url).hostname)])),
  ...SITE_OVERRIDES,
};

const PAPERS: Source = { name: 'Paper (hội nghị lớn)', type: 'papers', url: 'https://api.openalex.org/works', channel: 'paper', enabled: true };

export const SOURCES: Source[] = [...BLOGS, PAPERS].filter((s) => s.enabled);

/** Số bài gửi Google Chat mỗi giờ, chọn ngẫu nhiên trong hàng chờ (sent = 0). Nhiều bài thì card cách nhau ~1,1 s. */
export const MAX_PER_RUN = 1;
/** Số bài mới lưu vào D1 mỗi lượt, mới → cũ. Lưu không gửi gì nên cho nhiều hơn số bài gửi. */
export const MAX_INGEST_PER_RUN = 1000;
/** Số bài crawl nội dung đầy đủ mỗi lượt (mỗi giờ). */
export const CRAWL_PER_RUN = 100;
/** Thời gian tối đa (ms) cho bước crawl mỗi lượt; hết giờ thì dừng, bài chưa tải để lượt sau (giữ lượt chạy trong hạn khoá 10 phút). */
export const CRAWL_BUDGET_MS = 180_000;
/** Nội dung từ feed dài hơn mức này (ký tự) thì coi là đủ bài, khỏi tải trang. */
export const FULL_TEXT_MIN_CHARS = 1500;
export const MAX_CRAWL_TRIES = 3;
/** Số nguồn đọc cùng lúc (giữ bộ nhớ Worker 128 MB không bị vượt). */
export const FETCH_CONCURRENCY = 8;
export const FETCH_TIMEOUT_MS = 15000;
