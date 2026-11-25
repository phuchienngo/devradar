export type Channel = 'backend' | 'ai' | 'security';

export interface Source {
  name: string;
  type: 'rss' | 'atom';
  url: string;
  channel: Channel;
  /** Tắt một nguồn bằng enabled: false. */
  enabled: boolean;
}

const rss = (name: string, url: string, channel: Channel, enabled = true): Source => ({
  name,
  type: 'rss',
  url,
  channel,
  enabled,
});

/**
 * Engineering blogs của các công ty/tổ chức lớn. Nguồn: tuan3w/awesome-tech-rss (feeds.opml)
 * + blog chính thức của stack (Spring, Kotlin, Go). Không có blog cá nhân/newsletter/học thuật.
 * Tất cả đều bật (đang dùng Workers Paid nên không lo giới hạn 50 subrequest của gói free).
 */
export const BLOGS: Source[] = [
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

export const SOURCES: Source[] = BLOGS.filter((s) => s.enabled);

/** Tối đa số bài gửi mỗi lần chạy (mỗi bài một card, cách nhau ~1,1s). Phần dư để lần sau. */
export const MAX_PER_RUN = 30;
/** Bỏ bài cũ hơn N ngày (nếu parse được ngày). */
export const MAX_AGE_DAYS = 3;
export const FETCH_TIMEOUT_MS = 15000;
