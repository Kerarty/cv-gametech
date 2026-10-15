/* =========================================================================
   BALANCE.JS — модель лайвопс-события и расчёты.
   -------------------------------------------------------------------------
   Чистая логика, без DOM. Файл можно открыть в Node и считать там.

   Идея: у события три независимые величины, и именно их разводит дизайнер.

     1. БЮДЖЕТ (budget)      — сколько очков прогрессии разработчик разложил
                               на всё событие. Это то, что дизайнер настраивает.
     2. ПЛАН (доли по дням)   — как бюджет распределён по дням. Кривая сложности
                               решает, когда игрок получает основную часть.
     3. ТЕМП ИГРОКА (earnBase) — сколько очков он реально набирает в день.
                               Затухает (retention), потому что на четвёртый
                               день остаются не все.

   Раньше бюджет и темп масштабировались вместе, и тюнер ничего не мог
   исправить. Теперь они разделены: если игрок не добирает, дизайнер снижает
   бюджет события, а не увеличивает силу игрока. Это и есть работа.

   Четвёртая величина — ЦЕЛЬ (premiumPct): сколько процентов бюджета нужно
   набрать, чтобы дойти до финального блока наград.
   ========================================================================= */

const EVENT_DEFAULTS = {
  duration: 7,        // дней
  budget: 12000,      // очков прогрессии на всё событие
  earnBase: 2400,     // очков в день у среднего игрока
  curve: 0.45,        // 0..1 — насколько быстро растёт сложность
  retention: 0.90,    // затухание темпа день ко дню
  energyPerDay: 50,   // энергии в день у среднего игрока
  premiumPct: 85,     // % бюджета = цель события и порог премиум-окна
};

/* Когорты. weight — доля в аудитории, нужна для сводных цифр. */
const COHORTS = [
  { id: "novice", name: "Новичок",  mult: 0.74, weight: 0.50, color: "#7FA3C4" },
  { id: "mid",    name: "Средний",  mult: 1.00, weight: 0.35, color: "#6EE7A8" },
  { id: "active", name: "Активный", mult: 1.26, weight: 0.15, color: "#F2B441" },
];

const Balance = {
  defaults: () => ({ ...EVENT_DEFAULTS }),

  clamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  },

  days(cfg) {
    return Math.max(1, Math.round(cfg.duration));
  },

  /* Множитель сложности дня: 1.0 в первый день → (1 + curve*1.7) в последний. */
  difficulty(cfg, i) {
    const d = this.days(cfg);
    if (d === 1) return 1;
    return 1 + cfg.curve * 1.7 * (i / (d - 1));
  },

  /* Доля бюджета, которую событие требует набрать к концу дня i+1. */
  shares(cfg) {
    const d = this.days(cfg);
    const raw = [];
    let sum = 0;
    for (let i = 0; i < d; i++) {
      const v = this.difficulty(cfg, i);
      raw.push(v);
      sum += v;
    }
    return raw.map((v) => v / sum);
  },

  /* Симуляция события для одной когорты. */
  simulate(cfg, cohort) {
    const d = this.days(cfg);
    const shares = this.shares(cfg);
    const goal = (cfg.budget * cfg.premiumPct) / 100;

    const days = [];
    let cumShare = 0;
    let cumEarned = 0;
    let finishDay = null;
    let daysAhead = 0;

    for (let i = 0; i < d; i++) {
      cumShare += shares[i];
      const plan = cumShare * cfg.budget;          // сколько по плану должно быть накоплено
      const earnedDay = cfg.earnBase * cohort.mult * Math.pow(cfg.retention, i);
      cumEarned += earnedDay;
      if (finishDay === null && cumEarned >= goal) finishDay = i + 1;
      if (cumEarned >= plan) daysAhead++;
      days.push({
        day: i + 1,
        share: shares[i],
        planDay: shares[i] * cfg.budget,
        plan,
        earnedDay,
        cumEarned,
        difficulty: this.difficulty(cfg, i),
      });
    }

    const totalEarned = cumEarned;
    const completion = cfg.budget > 0 ? totalEarned / cfg.budget : 0;

    // Премиум-окно открывается за 2 дня до конца. Смотрим, хватает ли там.
    const windowStartDay = Math.max(1, d - 2);
    const atWindow = days.find((x) => x.day === windowStartDay);
    const scorePerEnergy = cfg.energyPerDay > 0 ? cfg.earnBase / cfg.energyPerDay : 0;
    const gap = atWindow ? goal - atWindow.cumEarned : 0;

    return {
      cohort,
      days,
      totalEarned,
      completion,                       // какую долю бюджета события выкупает когорта
      buffer: totalEarned - cfg.budget, // профицит (+) или дефицит (−) очков
      finishDay,                        // день, когда набрана цель
      missesBy: finishDay === null ? goal - totalEarned : 0,
      daysAhead,                        // сколько дней когорта шла по графику
      premium: {
        goal,
        windowStartDay,
        gap,                            // сколько очков не добрать до цели к началу окна
        gapEnergy: scorePerEnergy > 0 ? gap / scorePerEnergy : 0,
        reachable: totalEarned >= goal,
      },
    };
  },

  /* Все когорты, сводные метрики и выводы. */
  report(cfg) {
    const sims = COHORTS.map((c) => this.simulate(cfg, c));
    const mid = sims.find((x) => x.cohort.id === "mid");
    const novice = sims.find((x) => x.cohort.id === "novice");
    const active = sims.find((x) => x.cohort.id === "active");

    const reachShare = sims.reduce((s, x) => s + (x.finishDay !== null ? 1 : 0) * x.cohort.weight, 0);
    const finishAvg = sims.reduce(
      (s, x) => s + (x.finishDay || this.days(cfg) + 1) * x.cohort.weight,
      0
    );

    const findings = [];

    /* 1. Освоение бюджета средним игроком */
    if (mid.completion < 0.82) {
      findings.push({
        level: "bad",
        title: "Средний игрок выкупает меньше 82% бюджета",
        text:
          `К концу события у него ${(mid.completion * 100).toFixed(0)}% бюджета ` +
          `(дефицит ${fmt(Math.abs(mid.buffer))} очков). Первое, что проверяют игроки — сколько ` +
          `очков осталось недостижимых, и это убьёт интерес раньше, чем релиз покажет графики.`,
      });
    } else if (mid.completion > 1.22) {
      findings.push({
        level: "warn",
        title: "Бюджет не выкупается",
        text:
          `Средний игрок закрывает ${(mid.completion * 100).toFixed(0)}% бюджета. Награды лежат ` +
          `мёртвым грузом: игрок всё получает, впечатления не возникает, а стоимость контента ` +
          `всё равно та же.`,
      });
    } else {
      findings.push({
        level: "ok",
        title: "Бюджет выкупается в рабочем коридоре",
        text:
          `Средний игрок закрывает ${(mid.completion * 100).toFixed(0)}% бюджета — профицит ` +
          `${fmt(mid.buffer)} очков. Есть запас на ошибку игрока, но и наград хватает.`,
      });
    }

    /* 2. Разрыв когорт */
    const spread = active.completion - novice.completion;
    if (spread > 0.85) {
      findings.push({
        level: "warn",
        title: "Разрыв между активным и новичком слишком широкий",
        text:
          `Активный выкупает ${(active.completion * 100).toFixed(0)}% бюджета, новичок — ` +
          `${(novice.completion * 100).toFixed(0)}%. Новичок почти не участвует в наградах, ` +
          `и событие делит аудиторию вместо того, чтобы собирать её.`,
      });
    } else {
      findings.push({
        level: "ok",
        title: "Когорты не разваливаются",
        text:
          `Разрыв ${(spread * 100).toFixed(0)} п.п.: активный не улетает в космос, новичок ` +
          `не выпадает из события.`,
      });
    }

    /* 3. Хвост события: кто не доходит до цели */
    const lost = sims.filter((x) => x.finishDay === null);
    const lostShare = lost.reduce((s, x) => s + x.cohort.weight, 0);
    if (lost.length === 0) {
      findings.push({
        level: "ok",
        title: "Цель достигают все когорты",
        text: "Даже новичок добирает до финального блока — оставить событие незакрытым можно только по своей воле.",
      });
    } else if (lostShare > 0.6) {
      findings.push({
        level: "warn",
        title: "Больше 60% аудитории не доходит до цели",
        text:
          `Не добирают: ${lost.map((x) => x.cohort.name.toLowerCase()).join(", ")} — это ` +
          `${(lostShare * 100).toFixed(0)}% аудитории. Либо снижайте бюджет, либо добавляйте ` +
          `страховочные задания для отстающих когорт.`,
      });
    } else {
      findings.push({
        level: "ok",
        title: `Хвост события: цель не достигают ${lost.map((x) => x.cohort.name.toLowerCase()).join(", ")}`,
        text:
          `Это ${(lostShare * 100).toFixed(0)}% аудитории — нормальный хвост, если такие игроки ` +
          `добирают не меньше ${(Math.min(...lost.map((x) => x.completion)) * 100).toFixed(0)}% бюджета. ` +
          `Я бы всё равно добавил для них одно дешёвое страховочное задание: оно снимает часть ` +
          `негатива в отзывах почти бесплатно.`,
      });
    }

    /* 4. Премиум-стена */
    const gapE = mid.premium.gapEnergy;
    if (!mid.premium.reachable) {
      findings.push({
        level: "bad",
        title: "Цель недостижима вообще",
        text:
          `Даже к концу события среднему не хватает ${fmt(mid.missesBy)} очков. Финальный блок ` +
          `наград превращается в стену, мимо которой проходят.`,
      });
    } else if (gapE > cfg.energyPerDay * 1.5) {
      findings.push({
        level: "warn",
        title: "Премиум-стена близко к финалу",
        text:
          `К началу окна (день ${mid.premium.windowStartDay}) среднему не хватает ${fmt(gapE)} ` +
          `энергии — больше чем за полтора дня. Докупка превращается в отказ, а отказ — в негатив.`,
      });
    } else {
      findings.push({
        level: "ok",
        title: "Премиум-стена в рабочем коридоре",
        text:
          `До цели не хватает ≈ ${fmt(gapE)} энергии — это одно-два решения, а не вся неделя. ` +
          `Покупка выглядит осознанным выбором, а не вымогательством.`,
      });
    }

    /* 5. График: успевает ли игрок идти по плану */
    if (mid.daysAhead < Math.max(2, this.days(cfg) * 0.5)) {
      findings.push({
        level: "warn",
        title: "Игрок сходит с графика",
        text:
          `Средний идёт в график только ${mid.daysAhead} из ${this.days(cfg)} дней — основная ` +
          `часть бюджета приходится на конец, когда игрок уже устал от события. Сдвигайте вес ` +
          `на ранние дни: участие решается в первые сутки.`,
      });
    } else {
      findings.push({
        level: "ok",
        title: "График проходится",
        text:
          `Средний держит план ${mid.daysAhead} из ${this.days(cfg)} дней — награды разложены ` +
          `равномерно, а не свалены на конец.`,
      });
    }

    const verdict = findings.some((f) => f.level === "bad")
      ? "bad"
      : findings.some((f) => f.level === "warn")
      ? "warn"
      : "ok";

    return {
      cfg: { ...cfg },
      sims,
      mid,
      novice,
      active,
      reachShare,
      finishAvg,
      findings,
      verdict,
      goal: mid.premium.goal,
    };
  },

  /* Сравнение двух вариантов события. */
  compare(cfgA, cfgB) {
    const a = this.report(cfgA);
    const b = this.report(cfgB);
    return {
      a,
      b,
      rows: [
        { label: "Освоение бюджета", a: a.mid.completion, b: b.mid.completion, fmt: "pct",
          how: "Какую долю бюджета выкупает средний игрок. Коридор 82–122%: ниже — не добирает, выше — награды не ценятся." },
        { label: "Достигают цели", a: a.reachShare, b: b.reachShare, fmt: "pct",
          how: "Доля аудитории, дошедшая до финального блока наград, взвешенно по когортам." },
        { label: "День достижения цели", a: a.mid.finishDay || 0, b: b.mid.finishDay || 0, fmt: "day",
          how: "Когда средний игрок добирает до цели. Опоздание — потерянные последние дни активности." },
        { label: "Дней по графику", a: a.mid.daysAhead, b: b.mid.daysAhead, fmt: "num",
          how: "Сколько дней когорта шла по плану набора. Если мало — награды свалены в конец." },
        { label: "Не хватает энергии до цели", a: a.mid.premium.gapEnergy, b: b.mid.premium.gapEnergy, fmt: "num",
          how: "Объём допродажи в обычных энергиях к началу премиум-окна. Большое значение — стена." },
        { label: "Бюджет события", a: cfgA.budget, b: cfgB.budget, fmt: "num",
          how: "Сколько очков разложено на событие. Прямо влияет на стоимость контента." },
      ],
    };
  },

  /* Таблица заданий, собранная из модели. */
  generateTasks(cfg) {
    const shares = this.shares(cfg);
    return shares.map((share, i) => {
      const score = Math.round((cfg.budget * share) / 10) * 10;
      const diff = this.difficulty(cfg, i);
      const energy = Math.max(10, Math.round((cfg.energyPerDay * (0.7 + 0.45 * (diff - 1))) / 5) * 5);
      return {
        name: "День " + (i + 1) + " — основные задания",
        energy,
        reward: Math.round((score * 0.02) / 50) * 50,
        score,
      };
    });
  },
};

/* Таблица дропа для калькулятора вероятностей. */
const DROP_TABLE = [
  { name: "Редкий скилл", tier: "S", chance: 0.5,  price: 2400 },
  { name: "Эпик-герой",    tier: "A", chance: 4,    price: 620 },
  { name: "Эпик-набор",    tier: "A", chance: 6,    price: 480 },
  { name: "Редкие алмазы", tier: "B", chance: 12,   price: 190 },
  { name: "Супер-герой",   tier: "B", chance: 15,   price: 150 },
  { name: "Обычный набор", tier: "C", chance: 62.5, price: 40 },
];

const Drop = {
  stats(items, attempts, gemPerTry) {
    let totalEv = 0;
    const rows = items.map((it) => {
      const p = it.chance / 100;
      const atLeast = 1 - Math.pow(1 - p, attempts);
      const expected = attempts * p;
      const ev = expected * it.price;
      totalEv += ev;
      return { ...it, p, atLeast, expected, ev };
    });

    let pAll = 1;
    items.forEach((it) => {
      pAll *= 1 - Math.pow(1 - it.chance / 100, attempts);
    });

    return { rows, totalEv, cost: attempts * gemPerTry, margin: totalEv - attempts * gemPerTry, pAll };
  },
};

/* Форматирование чисел с пробелами. */
function fmt(n) {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  return sign + Math.round(Math.abs(n)).toLocaleString("ru-RU").replace(/,/g, " ");
}