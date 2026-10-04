/**
 * SlotWise seed — realistic demo data.
 * Run: bun run db:seed   (after bun run db:push)
 *
 * Demo accounts (password for all: Password#123):
 *   admin@slotwise.test   (ADMIN)
 *   priya@slotwise.test   (PROVIDER — physiotherapy)
 *   marco@slotwise.test   (PROVIDER — salon)
 *   aisha@slotwise.test   (PROVIDER — dental)
 *   lars@slotwise.test    (PROVIDER — tutoring)
 *   sam@slotwise.test     (CUSTOMER)
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

// Deterministic PRNG so the demo dataset is reproducible.
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function chance(p: number): boolean {
  return rand() < p;
}

const DAY = 86_400_000;
const now = new Date();
const todayStart = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
);

async function main() {
  console.log("Seeding SlotWise…");

  // Wipe (FK order)
  await db.review.deleteMany();
  await db.booking.deleteMany();
  await db.providerService.deleteMany();
  await db.availability.deleteMany();
  await db.provider.deleteMany();
  await db.service.deleteMany();
  await db.user.deleteMany();

  const passwordHash = await hash("Password#123", 10);

  // ── Users ────────────────────────────────────────────────────────────────
  const admin = await db.user.create({
    data: {
      name: "Amara Okafor",
      email: "admin@slotwise.test",
      passwordHash,
      role: "ADMIN",
    },
  });

  const providerSpecs = [
    {
      name: "Dr. Priya Nair",
      email: "priya@slotwise.test",
      bio: "Chartered physiotherapist with 9 years of clinical experience in sports injury rehab and posture therapy.",
      specialty: "Sports physiotherapy",
      // Mon–Fri 9–17, Sat 10–14, Sun 10–14
      availability: [
        ...[1, 2, 3, 4, 5].map((w) => ({ weekday: w, startMin: 9 * 60, endMin: 17 * 60 })),
        { weekday: 6, startMin: 10 * 60, endMin: 14 * 60 },
        { weekday: 0, startMin: 10 * 60, endMin: 14 * 60 },
      ],
    },
    {
      name: "Marco Silva",
      email: "marco@slotwise.test",
      bio: "Senior stylist specialising in precision cuts and warm, natural colour work.",
      specialty: "Hair & grooming",
      availability: [
        { weekday: 2, startMin: 9 * 60, endMin: 18 * 60 },
        { weekday: 3, startMin: 9 * 60, endMin: 18 * 60 },
        { weekday: 4, startMin: 9 * 60, endMin: 20 * 60 },
        { weekday: 5, startMin: 9 * 60, endMin: 20 * 60 },
        { weekday: 6, startMin: 9 * 60, endMin: 17 * 60 },
      ],
    },
    {
      name: "Aisha Khan",
      email: "aisha@slotwise.test",
      bio: "Dental hygienist focused on gentle, evidence-based preventive care.",
      specialty: "Preventive dentistry",
      availability: [
        { weekday: 1, startMin: 8 * 60, endMin: 16 * 60 },
        { weekday: 2, startMin: 8 * 60, endMin: 16 * 60 },
        { weekday: 3, startMin: 8 * 60, endMin: 16 * 60 },
        { weekday: 4, startMin: 10 * 60, endMin: 18 * 60 },
      ],
    },
    {
      name: "Lars Ericsson",
      email: "lars@slotwise.test",
      bio: "Maths & physics tutor; ex-engineer, obsessed with making GCSE and A-Level click.",
      specialty: "Maths & physics tuition",
      availability: [
        { weekday: 1, startMin: 15 * 60, endMin: 21 * 60 },
        { weekday: 3, startMin: 15 * 60, endMin: 21 * 60 },
        { weekday: 5, startMin: 15 * 60, endMin: 21 * 60 },
        { weekday: 6, startMin: 10 * 60, endMin: 16 * 60 },
        { weekday: 0, startMin: 11 * 60, endMin: 16 * 60 },
      ],
    },
  ];

  const providers: Record<string, { id: string; userId: string; services: { id: string; durationMin: number }[]; availability: { weekday: number; startMin: number; endMin: number }[] }> = {};

  for (const spec of providerSpecs) {
    const user = await db.user.create({
      data: {
        name: spec.name,
        email: spec.email,
        passwordHash,
        role: "PROVIDER",
        provider: {
          create: {
            bio: spec.bio,
            specialty: spec.specialty,
            availability: { create: spec.availability },
          },
        },
      },
      include: { provider: true },
    });
    providers[spec.email] = {
      id: user.provider!.id,
      userId: user.id,
      services: [],
      availability: spec.availability,
    };
  }

  const customerSpecs = [
    { name: "Sam Whitfield", email: "sam@slotwise.test" },
    { name: "Nadia Haddad", email: "nadia@slotwise.test" },
    { name: "Tom Bradley", email: "tom@slotwise.test" },
    { name: "Elena Petrova", email: "elena@slotwise.test" },
    { name: "Jamal Rahman", email: "jamal@slotwise.test" },
    { name: "Chloe Dubois", email: "chloe@slotwise.test" },
    { name: "Owen Price", email: "owen@slotwise.test" },
    { name: "Fatima Zahra", email: "fatima@slotwise.test" },
  ];
  const customers: { id: string }[] = [];
  for (const c of customerSpecs) {
    customers.push(
      await db.user.create({
        data: { name: c.name, email: c.email, passwordHash, role: "CUSTOMER" },
      }),
    );
  }

  // ── Services ─────────────────────────────────────────────────────────────
  const serviceSpecs = [
    { name: "Sports Injury Assessment", category: "Physiotherapy", description: "Movement screening, diagnosis and a rehab plan for acute or stubborn injuries.", durationMin: 45, price: 55, providers: ["priya@slotwise.test"] },
    { name: "Deep Tissue Massage", category: "Physiotherapy", description: "Firm-pressure massage targeting chronic tension in back, neck and shoulders.", durationMin: 60, price: 65, providers: ["priya@slotwise.test"] },
    { name: "Posture Correction Session", category: "Physiotherapy", description: "Desk-worker posture assessment with corrective exercises you can do at home.", durationMin: 30, price: 40, providers: ["priya@slotwise.test"] },
    { name: "Hygiene & Scale Polish", category: "Dental", description: "Full clean, scale and polish with gum health check and tailored advice.", durationMin: 40, price: 70, providers: ["aisha@slotwise.test"] },
    { name: "Whitening Consultation", category: "Dental", description: "Shade assessment and a safe, supervised whitening plan for sensitive teeth.", durationMin: 30, price: 90, providers: ["aisha@slotwise.test"] },
    { name: "Signature Haircut", category: "Salon", description: "Consultation, precision cut, wash and finish with a senior stylist.", durationMin: 45, price: 38, providers: ["marco@slotwise.test"] },
    { name: "Colour & Finish", category: "Salon", description: "Full-head colour or balayage with toner, blow-dry and finish.", durationMin: 90, price: 120, providers: ["marco@slotwise.test"] },
    { name: "Beard Trim & Shape", category: "Salon", description: "Hot-towel prep, scissor trim and line-up with beard oil finish.", durationMin: 30, price: 22, providers: ["marco@slotwise.test"] },
    { name: "GCSE Maths Booster", category: "Tutoring", description: "Targeted 1:1 practice on weak topics with past-paper drills.", durationMin: 60, price: 35, providers: ["lars@slotwise.test"] },
    { name: "A-Level Physics 1:1", category: "Tutoring", description: "Problem-solving deep-dives for mechanics, electricity and fields.", durationMin: 60, price: 45, providers: ["lars@slotwise.test"] },
    { name: "Exam Technique Workshop", category: "Tutoring", description: "Timed practice with marking-scheme coaching to stop silly marks leaks.", durationMin: 90, price: 60, providers: ["lars@slotwise.test"] },
  ];

  const services: Record<string, { id: string; durationMin: number }> = {};
  for (const s of serviceSpecs) {
    const created = await db.service.create({
      data: {
        name: s.name,
        category: s.category,
        description: s.description,
        durationMin: s.durationMin,
        price: s.price,
        providers: {
          create: s.providers.map((email) => ({
            providerId: providers[email]!.id,
          })),
        },
      },
    });
    services[s.name] = { id: created.id, durationMin: created.durationMin };
    for (const email of s.providers) {
      providers[email]!.services.push({ id: created.id, durationMin: created.durationMin });
    }
  }

  // ── Bookings (past 30 days + next 10 days) ───────────────────────────────
  interface BookingDraft {
    customerId: string;
    providerId: string;
    serviceId: string;
    startAt: Date;
    endAt: Date;
    status: string;
    notes: string | null;
    createdAt: Date;
  }

  const drafts: BookingDraft[] = [];
  const noteOptions = [
    "First visit — please send directions.",
    "Running 5 minutes late, sorry!",
    "Prefers a firm pressure.",
    "Bringing previous scan reports.",
    "Would like a reminder call the day before.",
    null, null, null,
  ];

  for (const [email, prov] of Object.entries(providers)) {
    if (prov.services.length === 0) continue;

    for (let offset = -30; offset <= 10; offset++) {
      const day = new Date(todayStart.getTime() + offset * DAY);
      const weekday = day.getUTCDay();
      const windows = prov.availability.filter((a) => a.weekday === weekday);
      if (windows.length === 0) continue;

      const isPast = offset < 0;
      const isToday = offset === 0;
      const density = isPast ? 0.5 : isToday ? 0.3 : 0.35;

      for (const w of windows) {
        let cursor = w.startMin;
        // For today, skip slots that are already in the past (keep a realistic diary).
        if (isToday) {
          const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
          cursor = Math.max(cursor, Math.ceil((nowMin + 30) / 15) * 15);
        }

        while (true) {
          const svc = pick(prov.services);
          if (cursor + svc.durationMin > w.endMin) break;
          if (!chance(density)) {
            cursor += 30;
            continue;
          }

          const startAt = new Date(day.getTime() + cursor * 60_000);
          const endAt = new Date(day.getTime() + (cursor + svc.durationMin) * 60_000);

          let status: string;
          if (isPast) {
            const roll = rand();
            status = roll < 0.8 ? "COMPLETED" : roll < 0.92 ? "NO_SHOW" : "CANCELLED";
          } else if (isToday) {
            status = chance(0.6) ? "CONFIRMED" : "COMPLETED";
          } else {
            status = chance(0.55) ? "CONFIRMED" : "PENDING";
          }

          drafts.push({
            customerId: pick(customers).id,
            providerId: prov.id,
            serviceId: svc.id,
            startAt,
            endAt,
            status,
            notes: pick(noteOptions),
            createdAt: new Date(startAt.getTime() - Math.floor(rand() * 5 + 1) * DAY),
          });

          cursor += svc.durationMin + 15;
        }
      }
      void email;
    }
  }

  // Guard against accidental duplicates before insert (belt & braces).
  const seen = new Set<string>();
  const unique = drafts.filter((d) => {
    const key = `${d.providerId}:${d.startAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const d of unique) {
    await db.booking.create({ data: d });
  }
  console.log(`Created ${unique.length} bookings.`);

  // ── Reviews on completed bookings ────────────────────────────────────────
  const completed = await db.booking.findMany({
    where: { status: "COMPLETED" },
    include: { review: true },
  });
  const comments = [
    "Felt genuinely looked after — already rebooked.",
    "Clear explanation of every step. Highly recommend.",
    "Exactly what I needed, worth every penny.",
    "Great results after just two sessions.",
    "Punctual, professional and friendly.",
    "Good, though running a few minutes behind.",
    "Solid session, would come back.",
    null,
  ];
  let reviewCount = 0;
  for (const b of completed) {
    if (b.review || !chance(0.55)) continue;
    const rating = rand() < 0.55 ? 5 : rand() < 0.75 ? 4 : 3;
    await db.review.create({
      data: {
        bookingId: b.id,
        authorId: b.customerId,
        rating,
        comment: pick(comments),
      },
    });
    reviewCount++;
  }
  console.log(`Created ${reviewCount} reviews.`);

  const counts = {
    users: await db.user.count(),
    providers: await db.provider.count(),
    services: await db.service.count(),
    bookings: await db.booking.count(),
    reviews: await db.review.count(),
  };
  console.log("Seed complete:", counts, "(admin:", admin.email + ")");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
