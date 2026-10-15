/* =========================================================================
   LAB.JS — интерфейс лаборатории: вкладки, графики, таблицы, расчёты.
   -------------------------------------------------------------------------
   Всё считает Balance из balance.js. Здесь только UI и отрисовка.
   ========================================================================= */

(() => {
  "use strict";

  /* --- СОСТОЯНИЕ -------------------------------------------------------- */
  const state = {
    cfg: Balance.defaults(),
    cfgB: Balance.defaults(),
    tab: "event",
    rows: [],
    hoverDay: null,
    slice: 0,
    fbTag: "all",
    drop: { attempts: 30, gemCost: 50 },
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const PALETTE = {
    mint: "#6EE7A8",
    mintDark: "#2E9B68",
    gold: "#F2B441",
    red: "#F2705A",
    blue: "#7FA3C4",
    grid: "rgba(255,255,255,0.055)",
    text: "#93A79A",
    dim: "#63786C",
  };

  const FONT = () => getComputedStyle(document.body).fontFamily;

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  /* --- ХЕЛПЕРЫ КАНВАСА --------------------------------------------------- */
  function setupCanvas(canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(280, canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 600);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    return { ctx, w, h: height };
  }

  function niceMax(v) {
    if (!(v > 0)) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  function drawAxes(ctx, box, maxY, days, unit) {
    const { x0, y0, x1, y1 } = box;
    ctx.font = "11px " + FONT();
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = PALETTE.dim;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= 4; i++) {
      const v = (maxY / 4) * i;
      const y = y1 - (y1 - y0) * (v / maxY);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.fillText(fmt(v), x0 - 8, y);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const every = days > 14 ? Math.ceil(days / 8) : 1;
    for (let d = 1; d <= days; d++) {
      if (d !== 1 && d !== days && d % every !== 0) continue;
      const x = x0 + ((x1 - x0) * (d - 1)) / Math.max(1, days - 1);
      ctx.fillText(String(d), x, y1 + 8);
    }

    ctx.textAlign = "left";
    ctx.fillText(unit, x0, y0 - 12);
    /* Подпись оси X убрана осознанно: справа от последнего деления она
       налезает на подпись цели и на точки концов линий. */
  }

  function plotLine(ctx, box, days, values, maxY, color, width, dashed) {
    const { x0, y0, x1, y1 } = box;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    values.forEach((v, i) => {
      const x = x0 + ((x1 - x0) * i) / Math.max(1, days - 1);
      const y = y1 - (y1 - y0) * (v / maxY);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function plotFill(ctx, box, days, low, high, maxY, color) {
    const { x0, y0, x1, y1 } = box;
    ctx.save();
    ctx.beginPath();
    high.forEach((v, i) => {
      const x = x0 + ((x1 - x0) * i) / Math.max(1, days - 1);
      ctx.lineTo(x, y1 - (y1 - y0) * (v / maxY));
    });
    for (let i = low.length - 1; i >= 0; i--) {
      const x = x0 + ((x1 - x0) * i) / Math.max(1, days - 1);
      ctx.lineTo(x, y1 - (y1 - y0) * (low[i] / maxY));
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function plotDot(ctx, x, y, color, r) {
    ctx.beginPath();
    ctx.arc(x, y, r || 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#0A0D0B";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function yOf(box, v, maxY) {
    return box.y1 - (box.y1 - box.y0) * (v / maxY);
  }

  function setLegend(canvas, html) {
    const parent = canvas.parentElement;
    parent.querySelectorAll(".legend").forEach((el) => el.remove());
    const el = document.createElement("div");
    el.className = "legend";
    el.innerHTML = html;
    parent.appendChild(el);
  }

  /* ============================================================
     ВКЛАДКА 1 — СОБЫТИЕ
     ============================================================ */
  function renderEvent() {
    const cfg = state.cfg;
    const rep = Balance.report(cfg);
    const days = Balance.days(cfg);
    const mid = rep.mid;

    $("#ev-duration-out").textContent = days + " " + plural(days, ["день", "дня", "дней"]);
    $("#ev-budget-out").textContent = fmt(cfg.budget) + " очков";
    $("#ev-earn-out").textContent = fmt(cfg.earnBase) + " в день";
    $("#ev-curve-out").textContent = "×" + (1 + cfg.curve * 1.7).toFixed(2) + " к финалу";
    $("#ev-retention-out").textContent = "−" + ((1 - cfg.retention) * 100).toFixed(0) + "% в день";
    $("#ev-energy-out").textContent = cfg.energyPerDay + " энергии";
    $("#ev-premium-out").textContent = cfg.premiumPct + "% · " + fmt(rep.goal) + " очков";

    const compPct = mid.completion * 100;
    const kpis = [
      {
        k: "Освоение бюджета",
        v: compPct.toFixed(0) + "%",
        d: (mid.buffer >= 0 ? "профицит " : "дефицит ") + fmt(Math.abs(mid.buffer)) + " очков",
        cls: compPct < 82 ? "bad" : compPct > 122 ? "warn" : "good",
      },
      {
        k: "Достигают цели",
        v: (rep.reachShare * 100).toFixed(0) + "%",
        d: "доля аудитории",
        cls: rep.reachShare >= 0.45 ? "good" : rep.reachShare >= 0.25 ? "warn" : "bad",
      },
      {
        k: "День достижения цели",
        v: mid.finishDay ? mid.finishDay + "-й" : "нет",
        d: mid.finishDay ? "из " + days : "не добирает " + fmt(mid.missesBy),
        cls: mid.finishDay && mid.finishDay <= days ? "good" : "bad",
      },
      {
        k: "Дней по графику",
        v: mid.daysAhead + " / " + days,
        d: "средний идёт в срок",
        cls: mid.daysAhead >= days * 0.5 ? "good" : "warn",
      },
      {
        k: "До цели не хватает",
        v: mid.premium.gapEnergy > 0 ? fmt(mid.premium.gapEnergy) : "0",
        d: "энергии к " + mid.premium.windowStartDay + "-му дню",
        cls: !mid.premium.reachable
          ? "bad"
          : mid.premium.gapEnergy > cfg.energyPerDay * 1.5
          ? "warn"
          : "good",
      },
    ];

    $("#evKpis").innerHTML = kpis
      .map(
        (x) =>
          '<div class="kpi"><div class="k">' + x.k + '</div>' +
          '<div class="v ' + x.cls + '">' + x.v + '</div>' +
          '<div class="d">' + x.d + "</div></div>"
      )
      .join("");

    /* --- график --- */
    const canvas = $("#chartCurve");
    const { ctx, w, h } = setupCanvas(canvas, 320);
    const box = { x0: 52, y0: 26, x1: w - 14, y1: h - 34 };
    const maxY = niceMax(Math.max(rep.goal, mid.totalEarned, rep.active.totalEarned) * 1.08);

    drawAxes(ctx, box, maxY, days, "очки прогрессии (накопительно)");

    const planVals = mid.days.map((d) => d.plan);
    const midVals = mid.days.map((d) => d.cumEarned);
    const low = rep.novice.days.map((d) => d.cumEarned);
    const high = rep.active.days.map((d) => d.cumEarned);

    plotFill(ctx, box, days, low, high, maxY, "rgba(110,231,168,0.10)");
    plotLine(ctx, box, days, planVals, maxY, PALETTE.gold, 2.2, false);
    plotLine(ctx, box, days, midVals, maxY, PALETTE.mint, 2.2, false);
    plotLine(ctx, box, days, low, maxY, PALETTE.blue, 1.2, true);
    plotLine(ctx, box, days, high, maxY, PALETTE.gold, 1.2, true);

    /* горизонтальная цель */
    const gy = yOf(box, rep.goal, maxY);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(242,180,65,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x0, gy);
    ctx.lineTo(box.x1, gy);
    ctx.stroke();
    ctx.restore();
    ctx.font = "11px " + FONT();
    ctx.fillStyle = PALETTE.gold;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("цель " + fmt(rep.goal), box.x0 + 6, gy - 4);

    plotDot(ctx, box.x1, yOf(box, planVals[planVals.length - 1], maxY), PALETTE.gold);
    plotDot(ctx, box.x1, yOf(box, midVals[midVals.length - 1], maxY), PALETTE.mint);

    /* наведение */
    if (state.hoverDay != null && state.hoverDay <= days) {
      const i = state.hoverDay - 1;
      const x = box.x0 + ((box.x1 - box.x0) * i) / Math.max(1, days - 1);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, box.y0);
      ctx.lineTo(x, box.y1);
      ctx.stroke();
      ctx.restore();

      plotDot(ctx, x, yOf(box, planVals[i], maxY), PALETTE.gold);
      plotDot(ctx, x, yOf(box, midVals[i], maxY), PALETTE.mint);

      const gap = midVals[i] - planVals[i];
      const lines = [
        "День " + state.hoverDay,
        "план: " + fmt(planVals[i]),
        "набирает: " + fmt(midVals[i]),
        "разрыв: " + (gap >= 0 ? "+" : "−") + fmt(Math.abs(gap)),
      ];
      const bw = 152;
      const bh = lines.length * 15 + 12;
      const bx = x + bw + 16 > box.x1 ? x - bw - 12 : x + 12;
      const by = box.y0 + 4;
      ctx.fillStyle = "rgba(8,12,9,0.94)";
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 7);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "left";
      lines.forEach((ln, k) => {
        ctx.fillStyle =
          k === 0 ? PALETTE.text : k === 1 ? PALETTE.gold : k === 2 ? PALETTE.mint : PALETTE.dim;
        ctx.font = (k === 0 ? "600 " : "") + "11px " + FONT();
        ctx.textBaseline = "top";
        ctx.fillText(ln, bx + 11, by + 9 + k * 15);
      });
    }

    setLegend(
      canvas,
      '<span style="color:' + PALETTE.gold + '"><i style="background:' + PALETTE.gold + '"></i>план по дням</span>' +
        '<span style="color:' + PALETTE.mint + '"><i style="background:' + PALETTE.mint + '"></i>набирает средний</span>' +
        '<span style="color:' + PALETTE.blue + '"><i class="dash" style="background:none"></i>новичок</span>' +
        '<span style="color:' + PALETTE.gold + '"><i class="dash" style="background:none"></i>активный</span>'
    );

    /* --- когорты --- */
    $("#evCohorts").innerHTML = rep.sims
      .map((s) => {
        const done = s.finishDay ? s.finishDay + "-й день" : "цели не достигает";
        return (
          '<div class="cohort" style="--cohort:' + s.cohort.color + '">' +
          "<h4>" + s.cohort.name + "</h4>" +
          '<div class="c-share">' +
          (s.cohort.weight * 100).toFixed(0) +
          "% аудитории · темп ×" + s.cohort.mult.toFixed(2) +
          "</div>" +
          "<dl>" +
          "<div><dt>Освоение бюджета</dt><dd>" + (s.completion * 100).toFixed(0) + "%</dd></div>" +
          "<div><dt>Достигает цели</dt><dd>" + done + "</dd></div>" +
          "<div><dt>Дней по графику</dt><dd>" + s.daysAhead + " / " + days + "</dd></div>" +
          "<div><dt>Профицит</dt><dd>" + (s.buffer >= 0 ? "+" : "−") + fmt(Math.abs(s.buffer)) + "</dd></div>" +
          "</dl></div>"
        );
      })
      .join("");

    $("#evVerdict").innerHTML = rep.findings
      .map((f) => '<li class="' + f.level + '"><strong>' + f.title + "</strong>" + f.text + "</li>")
      .join("");
  }

  /* ============================================================
     ВКЛАДКА 2 — ТАБЛИЦА КОНТЕНТА
     ============================================================ */
  function renderTable() {
    const cfg = state.cfg;
    const shares = Balance.shares(cfg);
    const body = $("#tbBody");
    const foot = $("#tbFoot");
    const totalScore = state.rows.reduce((s, r) => s + (Number(r.score) || 0), 0);

    body.innerHTML = "";

    state.rows.forEach((row, idx) => {
      const plan = shares[Math.min(idx, shares.length - 1)] * cfg.budget;
      const score = Number(row.score) || 0;
      const share = totalScore > 0 ? (score / totalScore) * 100 : 0;
      const delta = plan > 0 ? (score / plan) * 100 - 100 : 0;

      const last = state.rows.length - 1;
      const r = idx + 2; // номер строки в таблице, первая строка данных — вторая
      const shareFormula = "=ROUND(D" + r + "/SUM($D$2:$D$" + (last + 2) + ")*100,1)";
      const deltaFormula = "=ROUND(D" + r + "/E" + r + "*100-100,1)";

      const tr = document.createElement("tr");

      /* key — поле строки; display — что показать, если значение считается. */
      function cell(cls, key, type, formula, display) {
        const td = document.createElement("td");
        td.className = cls;
        const inp = document.createElement("input");
        inp.className = "cell " + (type === "number" ? "cell-num" : "cell-name");
        inp.value = display !== undefined ? display : row[key];
        if (type === "number") inp.type = "number";
        if (formula) inp.title = "формула: " + formula;
        if (type !== "text") {
          inp.addEventListener("input", () => {
            row[key] = Number(inp.value) || 0;
            renderTable();
            saveRows();
          });
        }
        td.appendChild(inp);
        tr.appendChild(td);
      }

      cell("c-name", "name", "text");
      cell("c-num", "energy", "number");
      cell("c-num", "reward", "number");
      cell("c-num", "score", "number");
      cell("c-num", "plan", "text", "план = бюджет события × доля дня", fmt(plan));

      const tdShare = document.createElement("td");
      tdShare.className = "c-num formula";
      tdShare.textContent = share.toFixed(1).replace(".", ",") + "%";
      tdShare.title = "формула: " + shareFormula;
      tr.appendChild(tdShare);

      const tdDelta = document.createElement("td");
      tdDelta.className = "c-num " + (delta >= 0 ? "delta-pos" : "delta-neg");
      tdDelta.textContent = (delta >= 0 ? "+" : "−") + Math.abs(delta).toFixed(1).replace(".", ",") + "%";
      tdDelta.title = "формула: " + deltaFormula;
      tr.appendChild(tdDelta);

      const tdAct = document.createElement("td");
      tdAct.className = "c-act";
      const del = document.createElement("button");
      del.className = "row-del";
      del.type = "button";
      del.textContent = "×";
      del.title = "Удалить строку";
      del.addEventListener("click", () => {
        state.rows.splice(idx, 1);
        renderTable();
        saveRows();
      });
      tdAct.appendChild(del);
      tr.appendChild(tdAct);

      body.appendChild(tr);
    });

    const totalEnergy = state.rows.reduce((s, r2) => s + (Number(r2.energy) || 0), 0);
    const totalReward = state.rows.reduce((s, r2) => s + (Number(r2.reward) || 0), 0);
    const avgDelta = state.rows.length
      ? state.rows.reduce((s, r2, i) => {
          const plan = shares[Math.min(i, shares.length - 1)] * cfg.budget;
          return s + ((Number(r2.score) || 0) / plan) * 100 - 100;
        }, 0) / state.rows.length
      : 0;

    foot.innerHTML =
      '<tr><td class="c-name">Итого по событию</td>' +
      '<td class="c-num">' + fmt(totalEnergy) + "</td>" +
      '<td class="c-num">' + fmt(totalReward) + "</td>" +
      '<td class="c-num">' + fmt(totalScore) + "</td>" +
      '<td class="c-num">' + fmt(cfg.budget) + "</td>" +
      '<td class="c-num">100%</td>' +
      '<td class="c-num">' + (avgDelta >= 0 ? "+" : "−") + Math.abs(avgDelta).toFixed(1).replace(".", ",") + "%</td>" +
      "<td></td></tr>";

    $("#tbNote").innerHTML =
      "Колонка «План» берётся из тюнера выше — это <b>независимая проверка</b>: если «Δ к плану» " +
      "уходит в минус, задание дня не закрывается. Кнопка «Копировать для Sheets» кладёт в буфер " +
      "TSV с формулами — вставляется в Google Sheets и пересчитывается сама.";
  }

  function tableAsTSV() {
    const last = state.rows.length - 1;
    const total = state.rows.reduce((s, r) => s + (Number(r.score) || 0), 0);
    const head = ["Задание", "Энергия", "Награда", "Очки", "Доля дня, %"];
    const rows = state.rows.map((r, i) =>
      [
        r.name,
        Number(r.energy) || 0,
        Number(r.reward) || 0,
        Number(r.score) || 0,
        "=ROUND(D" + (i + 2) + "/SUM($D$2:$D$" + (last + 2) + ")*100,1)",
        "=D" + (i + 2) + "/SUM($D$2:$D$" + (last + 2) + ")",
      ].join("\t")
    );
    return [head.join("\t")].concat(rows).join("\n");
  }

  function tableAsCSV() {
    const rows = state.rows.map((r) => [r.name, r.energy, r.reward, r.score].join(";"));
    return ["Название;Энергия;Награда;Очки"].concat(rows).join("\r\n");
  }

  function copyText(text, btnId) {
    const done = () => {
      const btn = $("#" + btnId);
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = "Готово ✓";
      setTimeout(() => (btn.textContent = old), 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {
      /* приватный режим — просто молча */
    }
    document.body.removeChild(ta);
  }

  const CHECKLIST = [
    "Названия и формулировки заданий совпадают с документом",
    "Порог премиум-окна выставлен по модели, а не «на глаз»",
    "Награды каждого дня в сумме равны плановому бюджету ±5%",
    "Проверены пограничные случаи: нулевой прогресс, двойной переход, истечение таймера",
    "В конфиге нет «магических» чисел — всё вынесено в таблицу",
    "Названия наград совпадают с текстом в клиенте (регистр, переносы)",
    "Таймеры в UTC и в локальной зоне игрока дают одно и то же",
    "Сценарий пропущенного дня посчитан отдельно",
    "Лимиты наград не превышают месячный бюджет",
    "Финальная таблица приложена к задаче, а не лежит в переписке",
  ];

  function renderChecklist() {
    const key = "gametech-cv-checklist";
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(key) || "{}") || {};
    } catch (e) {
      saved = {};
    }

    $("#tbCheck").innerHTML = CHECKLIST.map(
      (t, i) =>
        '<li><label for="chk' + i + '"><input type="checkbox" id="chk' + i + '" data-i="' + i + '"' +
        (saved[i] ? " checked" : "") + "><span>" + t + "</span></label></li>"
    ).join("");

    $$("#tbCheck input").forEach((el) => {
      el.addEventListener("change", () => {
        saved[el.dataset.i] = el.checked;
        try {
          localStorage.setItem(key, JSON.stringify(saved));
        } catch (e) {
          /* приватный режим */
        }
      });
    });
  }

  function saveRows() {
    try {
      localStorage.setItem("gametech-cv-rows", JSON.stringify(state.rows));
    } catch (e) {
      /* приватный режим */
    }
  }

  function loadRows() {
    try {
      const raw = localStorage.getItem("gametech-cv-rows");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {
      /* ок */
    }
    return Balance.generateTasks(state.cfg);
  }

  /* ============================================================
     ВКЛАДКА 3 — A/B
     ============================================================ */
  function renderAB() {
    const cfgB = state.cfgB;
    $("#ab-curve-out").textContent = "×" + (1 + cfgB.curve * 1.7).toFixed(2) + " к финалу";
    $("#ab-premium-out").textContent = cfgB.premiumPct + "% бюджета";
    $("#ab-budget-out").textContent = fmt(cfgB.budget) + " очков";

    const cmp = Balance.compare(state.cfg, cfgB);
    const days = Balance.days(cfgB);

    const canvas = $("#chartAB");
    const { ctx, w, h } = setupCanvas(canvas, 320);
    const box = { x0: 52, y0: 26, x1: w - 14, y1: h - 34 };

    const maxY = niceMax(
      Math.max(
        cmp.a.mid.totalEarned,
        cmp.b.mid.totalEarned,
        cmp.a.goal,
        cmp.b.goal,
        cmp.b.active.totalEarned
      ) * 1.08
    );
    drawAxes(ctx, box, maxY, days, "очки прогрессии (накопительно)");

    plotLine(ctx, box, days, cmp.a.mid.days.map((d) => d.plan), maxY, PALETTE.gold, 2.2, false);
    plotLine(ctx, box, days, cmp.a.mid.days.map((d) => d.cumEarned), maxY, PALETTE.gold, 1.6, true);
    plotLine(ctx, box, days, cmp.b.mid.days.map((d) => d.plan), maxY, PALETTE.blue, 2.2, false);
    plotLine(ctx, box, days, cmp.b.mid.days.map((d) => d.cumEarned), maxY, PALETTE.blue, 1.6, true);

    /* цели обоих вариантов */
    [
      { v: cmp.a.goal, c: PALETTE.gold },
      { v: cmp.b.goal, c: PALETTE.blue },
    ].forEach((t) => {
      const y = yOf(box, t.v, maxY);
      if (y < box.y0 || y > box.y1) return;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = t.c;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(box.x0, y);
      ctx.lineTo(box.x1, y);
      ctx.stroke();
      ctx.restore();
    });

    setLegend(
      canvas,
      '<span style="color:' + PALETTE.gold + '"><i style="background:' + PALETTE.gold + '"></i>вариант A</span>' +
        '<span style="color:' + PALETTE.blue + '"><i style="background:' + PALETTE.blue + '"></i>вариант B</span>' +
        '<span style="color:' + PALETTE.dim + '"><i class="dash" style="background:none"></i>пунктир — набирает средний игрок</span>'
    );

    const fmtVal = (v, kind) => {
      if (kind === "pct") return (v * 100).toFixed(0) + "%";
      if (kind === "day") return v ? v + "-й" : "—";
      return fmt(v);
    };

    $("#abBody").innerHTML = cmp.rows
      .map((r) => {
        const delta = r.b - r.a;
        const cls = r.fmt === "day" ? "" : delta >= 0 ? "delta-pos" : "delta-neg";
        const ds =
          Math.abs(delta) < 0.005
            ? "—"
            : r.fmt === "pct"
            ? (delta > 0 ? "+" : "−") + Math.abs(delta * 100).toFixed(0) + " п.п."
            : (delta > 0 ? "+" : "−") + fmt(Math.abs(delta));
        return (
          "<tr>" +
          '<td class="c-label">' + r.label + "</td>" +
          '<td class="c-num">' + fmtVal(r.a, r.fmt) + "</td>" +
          '<td class="c-num">' + fmtVal(r.b, r.fmt) + "</td>" +
          '<td class="c-num ' + cls + '">' + ds + "</td>" +
          '<td class="c-how">' + r.how + "</td>" +
          "</tr>"
        );
      })
      .join("");

    const rec =
      cmp.b.mid.completion < 0.82
        ? "вариант B хуже: средний игрок тем более не выкупает бюджет. Возвращаем A или поднимаем бюджет дня."
        : cmp.b.mid.completion > 1.22
        ? "вариант B слишком щедрый: событие перестанет быть напряжением, награды перестанут быть целью."
        : "вариант B попадает в рабочий коридор — его имеет смысл ставить на A/B-группу и мерить удержание.";
    $("#abNote").innerHTML =
      "Рекомендация: <b>" + rec + "</b> Дальше A/B-тест измеряет не «сколько очков», " +
      "а возврат в игру на седьмой день — именно эту метрику я бы попросил у аналитики " +
      "выгрузить для сравнения групп.";
  }

  /* ============================================================
     ВКЛАДКА 4 — ВЕРОЯТНОСТИ
     ============================================================ */
  function renderDrop() {
    const { attempts, gemCost } = state.drop;
    $("#dr-attempts-out").textContent = attempts + " " + plural(attempts, ["попытка", "попытки", "попыток"]);
    $("#dr-cost-out").textContent = gemCost + " кристаллов";

    const res = Drop.stats(DROP_TABLE, attempts, gemCost);
    const dec1 = (n) => n.toFixed(1).replace(".", ",");
    const dec2 = (n) => n.toFixed(2).replace(".", ",");
    const decCh = (n) => String(n).replace(".", ",");

    $("#drBody").innerHTML = res.rows
      .map(
        (r) =>
          "<tr>" +
          '<td class="c-name">' + r.name + "</td>" +
          '<td class="c-num">' + r.tier + "</td>" +
          '<td class="c-num">' + decCh(r.chance) + "%</td>" +
          '<td class="c-num">' + fmt(r.price) + "</td>" +
          '<td class="c-num">' + dec1(r.atLeast * 100) + "%</td>" +
          '<td class="c-num">' + dec2(r.expected) + "</td>" +
          '<td class="c-num">' + fmt(r.ev) + "</td>" +
          "</tr>"
      )
      .join("");

    $("#drFoot").innerHTML =
      '<tr><td class="c-name">Итого</td><td class="c-num"></td><td class="c-num">100%</td>' +
      '<td class="c-num"></td><td class="c-num"></td><td class="c-num"></td>' +
      '<td class="c-num">' + fmt(res.totalEv) + "</td></tr>";

    /* --- график EV --- */
    const canvas = $("#chartDrop");
    const rows = res.rows;
    const rowH = 32;
    const { ctx, w, h } = setupCanvas(canvas, Math.max(180, rows.length * rowH + 28));
    const maxEv = niceMax(Math.max.apply(null, rows.map((r) => r.ev).concat([1])));
    const labelW = 118;
    const x0 = labelW;
    const x1 = w - 62;
    const top = 14;

    ctx.font = "12px " + FONT();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText("EV, кристаллов", x0, 6);

    rows.forEach((r, i) => {
      const y = top + 14 + i * rowH;
      const bw = Math.max(2, ((x1 - x0) * r.ev) / maxEv);

      ctx.fillStyle = PALETTE.muted;
      ctx.textAlign = "right";
      ctx.fillText(r.name, labelW - 12, y + 9);

      ctx.fillStyle = "rgba(110,231,168,0.12)";
      ctx.fillRect(x0, y, x1 - x0, 18);
      const grad = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
      grad.addColorStop(0, "rgba(46,155,104,0.9)");
      grad.addColorStop(1, PALETTE.mint);
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y, bw, 18);

      ctx.fillStyle = PALETTE.mint;
      ctx.textAlign = "left";
      ctx.fillText(fmt(r.ev), Math.min(x0 + bw + 8, x1 + 6), y + 9);
    });

    /* --- выводы --- */
    const topRow = rows[0];
    const out = [
      {
        level: "info",
        title: "Редкое не значит дорогое по вкладу",
        text:
          topRow.name + " при шансе " + decCh(topRow.chance) + "% даёт EV " + fmt(topRow.ev) +
          " кристаллов. Игрок платит " + fmt(res.cost) + " за " + attempts + " попыток, " +
          "а получает " + fmt(res.totalEv) + " — маржа " +
          (res.margin >= 0 ? "+" : "−") + fmt(Math.abs(res.margin)) + ".",
      },
      {
        level: "info",
        title: "Сколько попыток нужно на S-тир",
        text:
          "P(хотя бы один «" + topRow.name + "» за " + attempts + " попыток) = " +
          dec1(topRow.atLeast * 100) + "%. " +
          "Если для игрока это «долгое событие», шанс либо снижают, либо добавляют гарантированный " +
          "тайник — иначе он уйдёт после первого провала.",
      },
      {
        level: res.margin >= 0 ? "ok" : "bad",
        title: res.margin >= 0 ? "Экономика сходится" : "Попытка стоит дороже содержимого",
        text:
          res.margin >= 0
            ? "Общая выдача покрывает стоимость попыток с запасом " + fmt(res.margin) +
              " кристаллов. Осталось проверить, что маржа не съедается на промо-периодах, " +
              "где игроки делают по 200 попыток."
            : "При таких шансах игрок в среднем платит больше, чем получает. Это либо осознанный " +
              "whale-механизм — тогда так и надо написать в документации, — либо ошибка бюджета.",
      },
      {
        level: res.pAll > 0.5 ? "ok" : "warn",
        title: "Полный набор за событие",
        text:
          "Вероятность собрать все " + rows.length + " позиций за " + attempts + " попыток: " +
          dec1(res.pAll * 100) + "%. " +
          (res.pAll > 0.5
            ? "Собирается большинством — набор имеет смысл как цель."
            : "Набор почти недостижим: он работает как «долгая мечта», а не как цель события. " +
              "Либо снижайте ставки, либо сделайте прогрессию гарантированной."),
      },
    ];

    $("#drVerdict").innerHTML = out
      .map((f) => '<li class="' + f.level + '"><strong>' + f.title + "</strong>" + f.text + "</li>")
      .join("");
  }

  /* ============================================================
     ВКЛАДКА 5 — РАЗБОР РЕЗУЛЬТАТОВ
     -------------------------------------------------------------------------
     Цифры ниже — с плейтестов «Королевств Эридора», учебная группа.
     Это не отчёт по продуктовому событию: коммерческого liveops-опыта
     пока нет, и делать вид, что он есть, было бы враньём. Показан метод.
     ============================================================ */
  const SLICES = [
    {
      tab: "Срез 1: кто выбывает",
      title: "Первое, что я смотрю после теста, — кто выбыл и на каком ходу",
      metrics: [
        { k: "Сели за партию", v: "10 / 10", d: "учебная группа", tone: "" },
        { k: "Выбыли до финала", v: "3", d: "все — на ходах 4–6", tone: "bad" },
        { k: "Средняя партия", v: "11 ходов", d: "цель по дизайну — 12", tone: "good" },
        { k: "Жалобы без замера", v: "4", d: "«кажется, медленно»", tone: "warn" },
      ],
      findings: [
        {
          level: "bad",
          title: "Трое выбывают в одной и той же точке",
          text:
            "Партия заканчивается на ходах 4–6: это один и тот же барьер, а не разные проблемы. " +
            "Искать три отдельные причины в такой ситуации — ошибка.",
        },
        {
          level: "warn",
          title: "Четыре жалобы «кажется, медленно»",
          text:
            "Жалоба без замера — не аргумент. Проверяю гипотезу: если выбывшие проходят порог " +
            "за 3 хода, но стратегия требует 6, виновата не длина, а отсутствие обратной связи о том, " +
            "что именно нужно догонять.",
        },
        {
          level: "ok",
          title: "Средняя длина партии почти равна задуманной",
          text:
            "11 против 12 ходов — дизайн не разваливается. Значит, правки нужны точечные, " +
            "а не пересборка баланса.",
        },
      ],
      next:
        "Гипотеза на следующую сессию: показать игроку, сколько ходов он отстаёт от темпа " +
        "фракции — одно значение, одно наблюдение. Если после этого выбывание в ходах 4–6 " +
        "перестанет повторяться, значит дело было в прозрачности, а не в балансе.",
    },
    {
      tab: "Срез 2: что меняем",
      title: "Одно изменение — одно наблюдение",
      metrics: [
        { k: "Сессий проведено", v: "15+", d: "с фиксацией замеров", tone: "good" },
        { k: "Изменений за сессию", v: "1", d: "не больше", tone: "good" },
        { k: "Параметров в таблице", v: "18", d: "у каждого есть причина", tone: "good" },
        { k: "Откатов правок", v: "3", d: "гипотеза не подтвердилась", tone: "warn" },
      ],
      findings: [
        {
          level: "ok",
          title: "Три правки пришлось откатить",
          text:
            "Это нормальная цена метода: гипотеза не подтвердилась, значит гипотеза была неверной. " +
            "Гораздо дороже было бы оставить «на глаз» подкрученное значение и не узнать об этом.",
        },
        {
          level: "ok",
          title: "Причина каждого числа лежит рядом",
          text:
            "В таблице параметров рядом со значением написано, что он проверяет. Через полгода " +
            "это экономит и время, и нервный срыв на спорке в чате.",
        },
        {
          level: "warn",
          title: "Один параметр меняли трижды",
          text:
            "Показатель атаки оказался слишком чувствительным к контексту: одна и та же цифра " +
            "работает в ближнем бою и ломает в осадном. Вывод — чувствительность параметра " +
            "сама по себе характеристика, её надо учитывать при настройке.",
        },
      ],
      next:
        "Следующий шаг: разнести контексты в разные таблицы, чтобы одна правка не задевала " +
        "вторую систему. В liveops это то же самое, что развести контент разных типов " +
        "по разным конфигам.",
    },
    {
      tab: "Срез 3: перенос на liveops",
      title: "Что из этого переносится на продуктовый контент",
      metrics: [
        { k: "Принципов переносимых", v: "4", d: "описаны выше", tone: "good" },
        { k: "Разовых живых тиражей", v: "0", d: "пока — и это указано", tone: "warn" },
        { k: "Что готово сделать сразу", v: "таблица и документ", d: "проверяемый артефакт", tone: "good" },
        { k: "Чего не хватает", v: "релизный опыт", d: "приходит только с тиражом", tone: "warn" },
      ],
      findings: [
        {
          level: "ok",
          title: "Плейтест-цикл и разбор тиража — одна и та же работа",
          text:
            "Собрать группу, зафиксировать замеры, сделать одну правку, повторить — это ровно то, " +
            "что происходит с лайвопс-событием после старта. Разница в масштабе, а не в методе.",
        },
        {
          level: "ok",
          title: "Чек-лист приёмки переносится напрямую",
          text:
            "Таблица контента и чек-лист «в конфиге так же, как в документе» — готовые артефакты. " +
            "Их можно отдать команде в первый же день, без подготовки.",
        },
        {
          level: "warn",
          title: "Прогноз с А/B я делал на плейтестах, не на проде",
          text:
            "Честное ограничение: я умею строить сравнение двух вариантов и считать разницу, " +
            "но проверял это на десяти людях, а не на живом трафике. Первый боевой тираж " +
            "рассматриваю как ту же сессию плейтеста, только дороже по последствиям.",
        },
      ],
      next:
        "Поэтому предлагаю так: беру первый тираж целиком и прошу фидбек по нему отдельно. " +
        "Если что-то в процессе окажется неверным — правлю быстро, потому что первую неделю " +
        "никто не строит на моих решениях.",
    },
  ];

  const FEEDBACK = [
    {
      tag: "баланс",
      quote: "«Первые два хода дают больше, чем третий и четвёртый вместе. Что-то сломалось»",
      read:
        "Не ошибка в конфиге, а следствие кривой сложности: бюджет первых дней почти равен " +
        "следующим. Игрок сравнивает не абсолют, а темп.",
      action:
        "Проверяю не «правильность чисел», а равномерность прироста. В тюнере за это отвечает " +
        "ползунок нарастания сложности и метрика «дней по графику».",
    },
    {
      tag: "интерфейс",
      quote: "«Я всё сделал, но не понял, где забрать награду»",
      read:
        "Игрок не знает, что финал состоялся. Проблема не в тексте, а в отсутствии явного " +
        "момента завершения.",
      action:
        "В правила и в чек-лист добавляю экран подтверждения закрытия и явную отметку " +
        "«событие завершено» в интерфейсе.",
    },
    {
      tag: "награды",
      quote: "«Награда за третий день хуже, чем за первый, хотя сложнее»",
      read:
        "Перекос воспринимаемой ценности. Очки прогрессии выросли, а ощущение «вот это добыл» — нет.",
      action:
        "Сверяю ценность не по очкам, а по заметности: внешний вид, звук, редкость, " +
        "место в витрине.",
    },
    {
      tag: "тайминг",
      quote: "«Событие закончилось, пока меня не было»",
      read:
        "Классическая жалоба на длительность. Ответ — не «сделаем длиннее», а пропуск " +
        "с пересчётом по накопленным очкам.",
      action:
        "В правила добавляю правило пропуска: вернувшись, игрок получает свой процент " +
        "от премиум-окна, а не ноль.",
    },
    {
      tag: "экономика",
      quote: "«Докупить, чтобы успеть, дороже, чем просто подождать»",
      read:
        "Премиум-стена не окупается: игрок сравнивает покупку с потерей события и выбирает второе.",
      action:
        "Пересчитываю стоимость окна: понижаю цену пропуска или добавляю дешёвые страховочные " +
        "задания, чтобы альтернатива покупке стала реальной.",
    },
    {
      tag: "контент",
      quote: "«Каждую неделю одно и то же»",
      read:
        "Насыщение шаблона: механика не меняется, меняются числа. Для еженедельного контента " +
        "это нормально, только если видна сезонная линия.",
      action:
        "Ввожу ежемесячную тему и триггерные механики, чтобы недельные события читались " +
        "как части одного сезона.",
    },
  ];

  function renderReport() {
    const s = SLICES[state.slice];

    $("#repSwitch").innerHTML = SLICES.map(
      (x, i) =>
        '<button class="tab' + (i === state.slice ? " is-active" : "") + '" role="tab" data-sl="' + i +
        '" aria-selected="' + (i === state.slice) + '">' + x.tab + "</button>"
    ).join("");

    $$("#repSwitch button").forEach((b) =>
      b.addEventListener("click", () => {
        state.slice = Number(b.dataset.sl);
        renderReport();
      })
    );

    $("#repMetrics").innerHTML = s.metrics
      .map(
        (m) =>
          '<div class="kpi"><div class="k">' + m.k + '</div>' +
          '<div class="v ' + (m.tone || "") + '">' + m.v + "</div>" +
          '<div class="d">' + m.d + "</div></div>"
      )
      .join("");

    $("#repTitle").textContent = s.title;
    $("#repVerdict").innerHTML = s.findings
      .map((f) => '<li class="' + f.level + '"><strong>' + f.title + "</strong>" + f.text + "</li>")
      .join("");

    $("#repNext").innerHTML = "<h4>Что я беру в следующую итерацию</h4><p>" + s.next + "</p>";

    const tags = ["all"].concat(
      FEEDBACK.map((f) => f.tag).filter((t, i, a) => a.indexOf(t) === i)
    );
    const labels = {
      all: "все отзывы",
      баланс: "баланс",
      интерфейс: "интерфейс",
      награды: "награды",
      тайминг: "тайминг",
      экономика: "экономика",
      контент: "контент",
    };

    $("#fbFilter").innerHTML = tags
      .map(
        (t) =>
          '<button class="tab' + (state.fbTag === t ? " is-active" : "") + '" data-fb="' + t + '">' +
          (labels[t] || t) + "</button>"
      )
      .join("");

    $$("#fbFilter button").forEach((b) =>
      b.addEventListener("click", () => {
        state.fbTag = b.dataset.fb;
        renderReport();
      })
    );

    const list = FEEDBACK.filter((f) => state.fbTag === "all" || f.tag === state.fbTag);
    $("#fbList").innerHTML = list
      .map(
        (f) =>
          '<div class="gt-card">' +
          '<span class="tag">' + f.tag + "</span>" +
          "<h3>" + f.quote + "</h3>" +
          '<p class="txt"><b>Как читаю:</b> ' + f.read + "</p>" +
          '<div class="mine">' + f.action + "</div>" +
          "</div>"
      )
      .join("");
  }

  /* ============================================================
     ВКЛАДКИ И СОБЫТИЯ
     ============================================================ */
  function renderTab() {
    if (state.tab === "event") renderEvent();
    else if (state.tab === "table") renderTable();
    else if (state.tab === "ab") renderAB();
    else if (state.tab === "drop") renderDrop();
    else if (state.tab === "report") renderReport();
  }

  function bindTabs() {
    const tabs = $$(".tabs .tab[data-tab]");
    function activate(name) {
      state.tab = name;
      tabs.forEach((t) => {
        const on = t.dataset.tab === name;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      $$(".panel[data-panel]").forEach((p) =>
        p.classList.toggle("is-active", p.dataset.panel === name)
      );
      state.hoverDay = null;
      renderTab();
    }
    tabs.forEach((t) => {
      t.addEventListener("click", () => activate(t.dataset.tab));
      t.addEventListener("keydown", (e) => {
        const i = tabs.indexOf(t);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          const n = tabs[(i + 1) % tabs.length];
          n.focus();
          activate(n.dataset.tab);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          const n = tabs[(i - 1 + tabs.length) % tabs.length];
          n.focus();
          activate(n.dataset.tab);
        }
      });
    });
  }

  function bindRange(id, apply) {
    const el = $("#" + id);
    if (!el) return;
    el.addEventListener("input", () => {
      apply(Number(el.value));
      renderTab();
      if (state.tab !== "table") renderTable();
    });
  }

  function syncInputs() {
    const set = (id, v) => {
      const el = $("#" + id);
      if (el) el.value = v;
    };
    set("ev-duration", state.cfg.duration);
    set("ev-budget", state.cfg.budget);
    set("ev-earn", state.cfg.earnBase);
    set("ev-curve", state.cfg.curve);
    set("ev-retention", state.cfg.retention);
    set("ev-energy", state.cfg.energyPerDay);
    set("ev-premium", state.cfg.premiumPct);
    set("ab-curve", state.cfgB.curve);
    set("ab-premium", state.cfgB.premiumPct);
    set("ab-budget", state.cfgB.budget);
    set("dr-attempts", state.drop.attempts);
    set("dr-cost", state.drop.gemCost);
  }

  function regenerateFromModel() {
    state.rows = Balance.generateTasks(state.cfg);
    renderTable();
    saveRows();
  }

  function bindAll() {
    bindRange("ev-duration", (v) => (state.cfg.duration = Balance.clamp(v, 3, 21)));
    bindRange("ev-budget", (v) => (state.cfg.budget = Balance.clamp(v, 4000, 40000)));
    bindRange("ev-earn", (v) => (state.cfg.earnBase = Balance.clamp(v, 800, 8000)));
    bindRange("ev-curve", (v) => (state.cfg.curve = Balance.clamp(v, 0, 1)));
    bindRange("ev-retention", (v) => (state.cfg.retention = Balance.clamp(v, 0.7, 1)));
    bindRange("ev-energy", (v) => (state.cfg.energyPerDay = Balance.clamp(v, 20, 150)));
    bindRange("ev-premium", (v) => (state.cfg.premiumPct = Balance.clamp(v, 40, 100)));

    bindRange("ab-curve", (v) => (state.cfgB.curve = Balance.clamp(v, 0, 1)));
    bindRange("ab-premium", (v) => (state.cfgB.premiumPct = Balance.clamp(v, 40, 100)));
    bindRange("ab-budget", (v) => (state.cfgB.budget = Balance.clamp(v, 4000, 40000)));

    bindRange("dr-attempts", (v) => (state.drop.attempts = Balance.clamp(v, 1, 200)));
    bindRange("dr-cost", (v) => (state.drop.gemCost = Balance.clamp(v, 10, 300)));

    $("#ev-reset").addEventListener("click", () => {
      state.cfg = Balance.defaults();
      syncInputs();
      regenerateFromModel();
      renderTab();
    });

    $("#tb-gen").addEventListener("click", regenerateFromModel);
    $("#tb-add").addEventListener("click", () => {
      const n = state.rows.length;
      state.rows.push({
        name: "День " + (n + 1) + " — бонусные задания",
        energy: 20,
        reward: 400,
        score: 300,
      });
      renderTable();
      saveRows();
    });
    $("#tb-reset").addEventListener("click", regenerateFromModel);
    $("#tb-tsv").addEventListener("click", () => copyText(tableAsTSV(), "tb-tsv"));
    $("#tb-csv").addEventListener("click", () => {
      const blob = new Blob(["﻿" + tableAsCSV()], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "liveops_content.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $("#ab-apply").addEventListener("click", () => {
      state.cfg = {
        ...state.cfg,
        curve: state.cfgB.curve,
        premiumPct: state.cfgB.premiumPct,
        budget: state.cfgB.budget,
      };
      syncInputs();
      regenerateFromModel();
      renderTab();
    });
    $("#ab-copy").addEventListener("click", () => {
      state.cfg = { ...state.cfgB };
      syncInputs();
      regenerateFromModel();
      renderTab();
    });

    const canvas = $("#chartCurve");
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const x0 = 52;
      const x1 = r.width - 14;
      const days = Balance.days(state.cfg);
      const t = (x - x0) / Math.max(1, x1 - x0);
      const day = Math.min(days, Math.max(1, Math.round(t * (days - 1)) + 1));
      if (day !== state.hoverDay) {
        state.hoverDay = day;
        renderEvent();
      }
    });
    canvas.addEventListener("mouseleave", () => {
      if (state.hoverDay !== null) {
        state.hoverDay = null;
        renderEvent();
      }
    });

    window.addEventListener("resize", debounce(() => renderTab(), 180));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) renderTab();
    });
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* --- СТАРТ ------------------------------------------------------------- */
  window.__labErrors = [];
  addEventListener("error", (e) => {
    const err = e.error || e;
    window.__labErrors.push((err.stack || err.message || String(err)).slice(0, 400));
  });

  function init() {
    state.cfgB = { ...state.cfg };
    state.rows = loadRows();
    syncInputs();
    bindTabs();
    bindAll();
    renderChecklist();
    renderTab();
    renderTable();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();