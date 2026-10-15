/* =========================================================================
   MAIN.JS — сборка статичных секций из CONTENT, скролл-спай, печать.
   ========================================================================= */

(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function init() {
    document.title = PROFILE.name + " — геймдизайнер: liveops, документация, баланс";
    renderHero();
    renderAbout();
    renderEducation();
    renderProjects();
    renderGameTech();
    renderProcess();
    renderMatch();
    renderSkills();
    renderContacts();
    revealOnScroll();
    scrollSpy();
    const pb = $("#printBtn");
    if (pb) pb.addEventListener("click", () => window.print());
  }

  /* --- ГЕРОЙ -------------------------------------------------------------- */
  function renderHero() {
    $("#brandName").textContent = PROFILE.name;
    $("#brandRole").textContent = PROFILE.role;

    $("#heroKicker").textContent = "Интерактивное резюме · " + PROFILE.vacancy;
    $("#heroTitle").textContent = PROFILE.name;
    $("#heroSub").textContent = PROFILE.pitch;

    $("#hcVacancy").textContent = PROFILE.vacancy;
    $("#hcList").innerHTML = [
      ["Роль", PROFILE.role],
      ["Город", PROFILE.city],
      ["Формат", "Удалённо / офис / гибрид"],
      ["Фокус", "LiveOps · баланс · документация"],
    ]
      .map((r) => "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>")
      .join("");

    $("#hcTags").innerHTML = ["Лайвопс", "Баланс", "Документация", "Excel / Sheets"]
      .map((t) => '<span class="chip">' + t + "</span>")
      .join("");

    $("#heroStats").innerHTML = STATS.map(
      (s) =>
        '<div class="stat"><div class="v">' + esc(s.value) + "</div>" +
        '<div class="l">' + esc(s.label) + "</div>" +
        '<div class="n">' + esc(s.note) + "</div></div>"
    ).join("");

    /* Подсказка автору, если данные ещё не заполнены. Исчезает сама. */
    if (/^\[/.test(PROFILE.name) || /example\.com|your_handle/.test(JSON.stringify(PROFILE.contacts))) {
      const warn = document.createElement("p");
      warn.className = "note";
      warn.style.marginTop = "16px";
      warn.style.padding = "10px 14px";
      warn.style.border = "1px dashed var(--line-2)";
      warn.style.borderRadius = "10px";
      warn.textContent =
        "Черновик: откройте content.js и замените значения в квадратных скобках — подсказка исчезнет.";
      $("#heroCard").appendChild(warn);
    }
  }

  /* --- О СЕБЕ ------------------------------------------------------------- */
  function renderAbout() {
    $("#aboutText").innerHTML =
      '<p class="lead">' + ABOUT.lead + "</p>" +
      ABOUT.body.map((p) => "<p>" + p + "</p>").join("");
    $("#aboutWant").innerHTML = ABOUT.want.map((w) => "<li>" + w + "</li>").join("");

    $("#gapsTitle").textContent = ABOUT.gaps.title;
    $("#aboutGaps").innerHTML = ABOUT.gaps.items
      .map(
        (g) =>
          "<li><b>" + g.t + "</b><span>" + g.d + "</span></li>"
      )
      .join("");
  }

  /* --- ОБРАЗОВАНИЕ -------------------------------------------------------- */
  function renderEducation() {
    $("#eduCourses").innerHTML = EDUCATION.courses
      .map(
        (c) =>
          '<div class="edu-card"><span class="years">' + c.years + "</span>" +
          "<h3>" + c.name + "</h3>" +
          '<p class="org">' + c.org + "</p>" +
          '<p class="note">' + c.note + "</p></div>"
      )
      .join("");

    $("#eduExtra").innerHTML = EDUCATION.extra.map((x) => "<li>" + x + "</li>").join("");
    $("#eduLangs").innerHTML = EDUCATION.languages
      .map((l) => "<li><span>" + l.label + "</span><span>" + l.level + "</span></li>")
      .join("");
  }

  /* --- КЕЙСЫ -------------------------------------------------------------- */
  function renderProjects() {
    $("#projectList").innerHTML = PROJECTS.map(
      (p) =>
        '<article class="project">' +
        '<div class="project-top"><span class="project-tag">' + p.tag + "</span>" +
        "<h3>" + p.title + "</h3>" +
        '<p class="sub">' + p.subtitle + "</p></div>" +
        '<div class="project-body">' +
        "<div><h4>Задача</h4><p>" + p.problem + "</p></div>" +
        "<div><h4>Решение</h4><p>" + p.solution + "</p></div>" +
        "<div><h4>Результат</h4><p>" + p.result + "</p></div>" +
        "</div>" +
        '<div class="project-foot">' + p.tags.map((t) => '<span class="chip">' + t + "</span>").join("") + "</div>" +
        "</article>"
    ).join("");
  }

  /* --- О ГЕЙМТЕК ---------------------------------------------------------- */
  function renderGameTech() {
    $("#gtLead").textContent = GAMETECH.lead;
    $("#gtCards").innerHTML = GAMETECH.cards
      .map(
        (c) =>
          '<article class="gt-card">' +
          '<span class="tag">' + c.tag + "</span>" +
          "<h3>" + c.title + "</h3>" +
          '<p class="kicker">' + c.kicker + "</p>" +
          '<p class="txt">' + c.text + "</p>" +
          '<div class="mine">' + c.mine + "</div>" +
          "</article>"
      )
      .join("");
    $("#gtWeek1").innerHTML = GAMETECH.week1.map((x) => "<li>" + x + "</li>").join("");
  }

  /* --- МЕТОД -------------------------------------------------------------- */
  function renderProcess() {
    $("#processSteps").innerHTML = PROCESS.map(
      (s) =>
        '<div class="step"><div class="step-n">' + s.n + "</div>" +
        '<div class="step-body"><h3>' + s.title + "</h3><p>" + s.text + "</p>" +
        '<div class="step-out">→ ' + s.out + "</div></div></div>"
    ).join("");

    $("#ruleList").innerHTML = RULES.map(
      (r) => '<div class="rule"><b>' + r.t + "</b><p>" + r.d + "</p></div>"
    ).join("");
  }

  /* --- СООТВЕТСТВИЕ ВАКАНСИИ ---------------------------------------------- */
  function renderMatch() {
    $("#matchLead").textContent = MATCH.lead;
    $("#matchGrid").innerHTML = MATCH.groups
      .map(
        (g) =>
          '<div class="match-card"><h3>' + g.title + "</h3><ul class=\"match-list\">" +
          g.items
            .map(
              (i) =>
                '<li><a href="' + i.ref + '"><span>' + i.text +
                '</span><span class="ref">' + i.refText + "</span></a></li>"
            )
            .join("") +
          "</ul></div>"
      )
      .join("");
  }

  /* --- НАВЫКИ ------------------------------------------------------------- */
  function renderSkills() {
    $("#skillGroups").innerHTML = SKILLS.map(
      (g) =>
        '<div class="skill-card"><h3>' + g.title + "</h3><ul>" +
        g.items.map((i) => "<li>" + i + "</li>").join("") +
        "</ul></div>"
    ).join("");
  }

  /* --- КОНТАКТЫ ----------------------------------------------------------- */
  function renderContacts() {
    $("#signLine").textContent = SIGN.line;
    $("#contactList").innerHTML = PROFILE.contacts
      .map(
        (c) =>
          '<a class="contact" href="' + c.href + '"' +
          (/^https?:/.test(c.href) ? ' target="_blank" rel="noopener"' : "") +
          '><span class="k">' + c.label + '</span><span class="v">' + c.value + "</span></a>"
      )
      .join("");

    $("#changelogHead").textContent = SIGN.changelogHead;
    $("#changelogLead").textContent = SIGN.changelogLead;
    $("#changelogList").innerHTML = SIGN.changelog
      .map(
        (c) =>
          '<li><span class="v">' + c.v + '</span><span class="d">' + c.date + "</span><span>" + c.text + "</span></li>"
      )
      .join("");

    $("#footNote").textContent =
      PROFILE.name + " · " + PROFILE.role + " · " + PROFILE.city +
      " — страница собрана как одностраничный документ: её можно распечатать в PDF.";
  }

  /* --- ПОЯВЛЕНИЕ ПРИ СКРОЛЛЕ --------------------------------------------- */
  function revealOnScroll() {
    const items = $$("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );
    items.forEach((el) => io.observe(el));
  }

  /* --- ПОДСВЕТКА АКТИВНОГО РАЗДЕЛА --------------------------------------- */
  function scrollSpy() {
    const links = $$(".nav a[data-spy]");
    const sections = links
      .map((a) => document.querySelector(a.getAttribute("href")))
      .filter(Boolean);
    if (!("IntersectionObserver" in window) || !sections.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          links.forEach((l) =>
            l.classList.toggle("is-active", l.getAttribute("href") === "#" + e.target.id)
          );
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach((s) => io.observe(s));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();