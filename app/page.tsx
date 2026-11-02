"use client";
import { useEffect, useState } from "react";
import {
  Search,
  Heart,
  Clock,
  Flame,
  ArrowUpRight,
  Leaf,
  CalendarDays,
  ArrowLeftRight,
  Settings2,
  Plus,
  X,
  ChefHat,
  LogOut,
  SlidersHorizontal,
  Check,
  ShieldCheck,
  Utensils,
  Star,
  ArrowRight,
  LayoutGrid,
} from "lucide-react";
type Row = Record<string, any>;
const nav = [
  ["Discover", LayoutGrid],
  ["Meal planner", CalendarDays],
  ["Saved recipes", Heart],
  ["Ingredient swaps", ArrowLeftRight],
  ["My kitchen", ChefHat],
  ["Preferences", Settings2],
] as const;
export default function Home() {
  const [data, setData] = useState<Row>({
    recipes: [],
    allergens: [],
    ingredients: [],
    cuisines: [],
    diets: [],
    user: null,
  });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Discover");
  const [search, setSearch] = useState("");
  const [diet, setDiet] = useState("All recipes");
  const [cuisine, setCuisine] = useState("");
  const [safeOnly, setSafeOnly] = useState(false);
  const [quick, setQuick] = useState(false);
  const [sort, setSort] = useState("Recommended");
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<Row[]>([]);
  const [swaps, setSwaps] = useState<Row[]>([]);
  const [reviews, setReviews] = useState<Row[]>([]);
  const [register, setRegister] = useState(false);
  const [profile, setProfile] = useState<Row>({});
  const [draft, setDraft] = useState<Row>({});
  async function load() {
    const r = await fetch("/api/bootstrap");
    if (!r.ok) throw Error("Could not load recipes");
    const d = await r.json();
    setData(d);
    setProfile(d.user || {});
    setLoading(false);
  }
  useEffect(() => {
    load().catch((e) => {
      setNotice(e.message);
      setLoading(false);
    });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  async function refreshPlans() {
    const r = await fetch("/api/plans");
    const d = await r.json();
    if (r.ok) setPlans(d);
    else setNotice(d.error);
  }
  useEffect(() => {
    if (tab === "Meal planner" && data.user) refreshPlans();
    if (tab === "Ingredient swaps")
      fetch("/api/substitutions")
        .then((r) => r.json())
        .then(setSwaps);
  }, [tab, data.user]);
  async function post(path: string, body: Row, success?: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load();
      if (success) setNotice(success);
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function authNeeded() {
    if (data.user) return false;
    setModal("auth");
    return true;
  }
  function openRecipe(r: Row) {
    setSelected(r);
    setModal("detail");
    fetch("/api/reviews/" + r.recipe_id)
      .then((r) => r.json())
      .then(setReviews);
  }
  function editRecipe(r?: Row) {
    if (authNeeded()) return;
    setDraft(
      r
        ? {
            ...r,
            ingredients: r.ingredients.map((i: Row) => ({
              ingredient_id: i.ingredient_id,
              quantity: i.quantity,
            })),
            instructions: r.instructions.join("\n"),
          }
        : {
            title: "",
            description: "",
            instructions: "",
            prep_time_minutes: 10,
            cook_time_minutes: 20,
            servings: 2,
            calories_per_serving: 400,
            protein_g: 15,
            carbs_g: 40,
            fat_g: 12,
            cuisine_id: 1,
            diet_id: 1,
            meal_type: "Lunch",
            ingredients: [{ ingredient_id: 1, quantity: 100 }],
          },
    );
    setModal("recipe");
  }
  let shown = data.recipes.filter(
    (r: Row) =>
      (tab !== "Saved recipes" || r.favorite) &&
      (tab !== "My kitchen" || r.created_by === data.user?.user_id) &&
      `${r.title} ${r.description} ${r.ingredients.map((i: Row) => i.name).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (diet === "All recipes" || r.diet === diet) &&
      (!cuisine || r.cuisine === cuisine) &&
      (!safeOnly || !r.conflicts.length) &&
      (!quick || r.prep_time_minutes + r.cook_time_minutes <= 30),
  );
  if (sort === "Quickest")
    shown.sort(
      (a: Row, b: Row) =>
        a.prep_time_minutes +
        a.cook_time_minutes -
        (b.prep_time_minutes + b.cook_time_minutes),
    );
  if (sort === "Highest rated")
    shown.sort((a: Row, b: Row) => b.avg_rating - a.avg_rating);
  if (sort === "Lowest calories")
    shown.sort(
      (a: Row, b: Row) => a.calories_per_serving - b.calories_per_serving,
    );
  const field = (key: string, value: any) =>
    setDraft((p) => ({ ...p, [key]: value }));
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="RecipeRadar home">
          <span className="brand-icon">
            <Utensils size={21} />
          </span>
          recipe<span>radar</span>
          <i />
        </a>
        <div className="workspace-label">YOUR DAILY INSPIRATION</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={tab === name ? "nav active" : "nav"}
              onClick={() => {
                setTab(name);
                setSearch("");
                setDiet("All recipes");
              }}
            >
              <Icon size={19} />
              {name}
              {name === "Saved recipes" && (
                <small>
                  {data.recipes.filter((r: Row) => r.favorite).length}
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">✧</span>
          <h3>
            A little planning.
            <br />A lot of feeling good.
          </h3>
          <p>Make room for a healthier, happier week.</p>
          <button onClick={() => setTab("Meal planner")}>
            Plan my week <ArrowRight size={15} />
          </button>
        </div>
        <div className="account">
          <div className="avatar">{data.user?.name?.[0] || "R"}</div>
          <button
            onClick={() =>
              data.user ? setTab("Preferences") : setModal("auth")
            }
          >
            <strong>{data.user?.name || "Welcome, food lover"}</strong>
            <span>
              {data.user ? "Your personal kitchen" : "Sign in to your kitchen"}
            </span>
          </button>
          {data.user && (
            <button
              aria-label="Sign out"
              onClick={() => post("auth", { mode: "logout" }, "Signed out")}
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            Your kitchen <span>/</span> <strong>{tab}</strong>
          </div>
          <div className="header-right">
            <span className="live-dot" /> A fresh start, every day{" "}
            <button
              className="round"
              onClick={() =>
                data.user ? setTab("Preferences") : setModal("auth")
              }
              aria-label="Open account"
            >
              {data.user?.name?.[0] || "R"}
            </button>
          </div>
        </header>
        <main>
          <div className="title-row">
            <div>
              <div className="eyebrow">
                <span /> GOOD FOOD. MADE FOR YOU.
              </div>
              <h1>
                {tab === "Discover"
                  ? "Find your next favorite."
                  : tab === "Meal planner"
                    ? "A week worth looking forward to."
                    : tab === "Saved recipes"
                      ? "The recipes you come back to."
                      : tab === "Ingredient swaps"
                        ? "Small swaps. New possibilities."
                        : tab === "My kitchen"
                          ? "Made by you, shared with love."
                          : "A little more you."}
              </h1>
              <p className="subtitle">
                {tab === "Discover"
                  ? "Recipes that fit your taste, your goals, and your everyday life."
                  : tab === "Preferences"
                    ? "Tell us what works for you. We’ll help you find your fit."
                    : tab === "Ingredient swaps"
                      ? "Explore ingredient alternatives, with your preferences in mind."
                      : "Good choices today. A little less to think about tomorrow."}
              </p>
            </div>
            <button className="outline" onClick={() => editRecipe()}>
              <Plus size={16} /> Add recipe
            </button>
          </div>
          {["Discover", "Saved recipes", "My kitchen"].includes(tab) && (
            <>
              {tab === "Discover" && (
                <section className="hero">
                  <div className="hero-copy">
                    <div className="hero-kicker">
                      <Leaf size={14} /> A FRESH TAKE ON EVERYDAY EATING
                    </div>
                    <h2>
                      Good for you.
                      <br />
                      Even better on your plate.
                    </h2>
                    <p>
                      Discover wholesome recipes and make
                      <br className="desktop" /> every meal a little more your
                      own.
                    </p>
                    <button
                      className="primary"
                      onClick={() => {
                        setDiet("Vegan");
                        document
                          .getElementById("recipes")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      Find my inspiration <ArrowUpRight size={16} />
                    </button>
                    <div className="hero-bottom">
                      <span className="mini-avatars">🥑 🥕 🥦</span> Fresh
                      ingredients. Endless possibilities.
                    </div>
                  </div>
                  <div className="hero-image">
                    <img
                      src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=90"
                      alt="Fresh colorful vegetable salad"
                    />
                    <div className="floating-label">
                      <span>✦</span>
                      <div>
                        <strong>A bowl full of good</strong>
                        <small>Fresh, colorful & completely you</small>
                      </div>
                    </div>
                  </div>
                </section>
              )}
              <div className="discovery-heading" id="recipes">
                <div>
                  <h2>
                    {tab === "Discover"
                      ? "A little inspiration for your table"
                      : tab === "Saved recipes"
                        ? "Your personal recipe collection"
                        : "Your recipe collection"}
                  </h2>
                  <p>
                    {tab === "Discover"
                      ? "Simple ingredients. Something delicious."
                      : "Your next good meal is right here."}
                  </p>
                </div>
                <span className="count">{shown.length} recipes to explore</span>
              </div>
              <div className="search-row">
                <div className="search">
                  <Search size={19} />
                  <input
                    aria-label="Search recipes"
                    placeholder="What are you craving? Search recipes, ingredients…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <button
                  className={"outline " + (quick ? "selected" : "")}
                  onClick={() => setQuick(!quick)}
                >
                  <Clock size={16} /> Under 30 min{" "}
                  {quick && <Check size={14} />}
                </button>
                <label className="outline">
                  <SlidersHorizontal size={16} />
                  <select
                    aria-label="Filter by cuisine"
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                  >
                    <option value="">All cuisines</option>
                    {data.cuisines.map((c: Row) => (
                      <option key={c.cuisine_id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="filter-row">
                <div className="chips">
                  {[
                    "All recipes",
                    "Vegan",
                    "Vegetarian",
                    "High protein",
                    "Balanced",
                  ].map((d, i) => (
                    <button
                      key={d}
                      className={diet === d ? "chip chosen" : "chip"}
                      onClick={() => setDiet(d)}
                    >
                      {i === 1 ? "🌱 " : i === 2 ? "🥬 " : i === 3 ? "💪 " : ""}
                      {d}
                    </button>
                  ))}
                </div>
                <label className="safety-toggle">
                  <input
                    type="checkbox"
                    checked={safeOnly}
                    onChange={(e) => {
                      if (!authNeeded()) setSafeOnly(e.target.checked);
                    }}
                  />
                  <ShieldCheck size={15} /> Match my allergens
                </label>
              </div>
              <div className="results-line">
                <span>
                  {loading
                    ? "Finding your next favorite…"
                    : `${shown.length} delicious possibilities`}
                </span>
                <label>
                  Sort by:{" "}
                  <select
                    aria-label="Sort recipes"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    {[
                      "Recommended",
                      "Quickest",
                      "Highest rated",
                      "Lowest calories",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="recipe-grid">
                {shown.map((r: Row) => (
                  <article className="recipe-card" key={r.recipe_id}>
                    <div
                      className="card-image"
                      onClick={() => openRecipe(r)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && openRecipe(r)}
                      aria-label={"View " + r.title}
                    >
                      {r.image ? (
                        <img src={r.image} alt={r.title} />
                      ) : (
                        <div className="image-placeholder">
                          <ChefHat size={50} />
                        </div>
                      )}
                      <span
                        className={
                          "diet-badge " + (r.diet === "Vegan" ? "green" : "")
                        }
                      >
                        {r.diet === "Vegan" && <Leaf size={12} />} {r.diet}
                      </span>
                      <button
                        className={"heart " + (r.favorite ? "saved" : "")}
                        aria-label={
                          r.favorite ? "Unsave " + r.title : "Save " + r.title
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!authNeeded())
                            post("favorite", { recipe_id: r.recipe_id });
                        }}
                      >
                        <Heart
                          size={18}
                          fill={r.favorite ? "currentColor" : "none"}
                        />
                      </button>
                      {r.conflicts.length > 0 && (
                        <div className="allergen-badge">
                          Contains{" "}
                          {r.conflicts.map((a: Row) => a.name).join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="card-body">
                      <div className="card-category">
                        {r.cuisine}
                        <span>
                          <Star size={12} fill="#e9ac58" stroke="#e9ac58" />
                          {r.avg_rating
                            ? Number(r.avg_rating).toFixed(1)
                            : "New"}
                        </span>
                      </div>
                      <button
                        className="recipe-title"
                        onClick={() => openRecipe(r)}
                      >
                        {r.title}
                      </button>
                      <p>{r.description}</p>
                      <div className="card-bottom">
                        <span>
                          <Clock size={14} />
                          {r.prep_time_minutes + r.cook_time_minutes} min
                        </span>
                        <span>
                          <Flame size={14} />
                          {r.calories_per_serving} kcal
                        </span>
                        <button
                          aria-label={"Open " + r.title}
                          onClick={() => openRecipe(r)}
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!loading && !shown.length && (
                <div className="empty">
                  <ChefHat size={36} />
                  <h3>Let’s find something different.</h3>
                  <p>Try another search or add a recipe to your kitchen.</p>
                  <button
                    className="outline"
                    onClick={() => {
                      setSearch("");
                      setDiet("All recipes");
                      setCuisine("");
                      setQuick(false);
                      setSafeOnly(false);
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "Preferences" &&
            (!data.user ? (
              <SignIn onClick={() => setModal("auth")} />
            ) : (
              <form
                className="panel profile"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await post("profile", profile, "Preferences saved");
                }}
              >
                <h2>Your food, your way.</h2>
                <p>
                  These preferences shape allergen alerts and your meal plans.
                </p>
                <div className="form-grid">
                  <label>
                    Your name
                    <input
                      required
                      value={profile.name || ""}
                      onChange={(e) =>
                        setProfile({ ...profile, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Daily calorie target
                    <input
                      type="number"
                      min="800"
                      max="6000"
                      required
                      value={profile.daily_calorie_target || 2000}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          daily_calorie_target: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Diet preference
                    <select
                      value={profile.diet_goal || "Balanced"}
                      onChange={(e) =>
                        setProfile({ ...profile, diet_goal: e.target.value })
                      }
                    >
                      {["Balanced", "Vegan", "Vegetarian", "High protein"].map(
                        (d) => (
                          <option key={d}>{d}</option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <h3>Ingredients to watch out for</h3>
                <div className="allergen-options">
                  {data.allergens.map((a: Row) => (
                    <label key={a.allergen_id}>
                      <input
                        type="checkbox"
                        checked={
                          profile.allergens?.includes(a.allergen_id) || false
                        }
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            allergens: e.target.checked
                              ? [...(profile.allergens || []), a.allergen_id]
                              : profile.allergens.filter(
                                  (x: number) => x !== a.allergen_id,
                                ),
                          })
                        }
                      />
                      {a.name}
                    </label>
                  ))}
                </div>
                <p className="muted">
                  Alerts use recorded ingredient data. Check product labels and
                  cross-contact information separately.
                </p>
                <button className="primary" disabled={busy}>
                  Save preferences <Check size={16} />
                </button>
              </form>
            ))}
          {tab === "Ingredient swaps" && (
            <>
              <div className="info-banner">
                <Leaf size={22} />
                <div>
                  <strong>A different ingredient. A familiar flavor.</strong>
                  <p>
                    Similarity scores are curated flavor estimates. Suggestions
                    flagged with your allergens need extra attention.
                  </p>
                </div>
              </div>
              <div className="swap-grid">
                {swaps.map((s) => (
                  <div className="panel swap" key={s.ingredient_id_from}>
                    <div className="swap-label">INSTEAD OF</div>
                    <h3>{s.original}</h3>
                    <ArrowLeftRight size={20} />
                    <div className="swap-label">TRY THIS</div>
                    <h3>{s.replacement}</h3>
                    <span className="match">
                      {Math.round(s.similarity_score * 100)}% flavor match
                    </span>
                    {s.conflicts.length > 0 && (
                      <p className="warning">
                        Contains your allergen:{" "}
                        {s.conflicts.map((a: Row) => a.name).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "Meal planner" &&
            (!data.user ? (
              <SignIn onClick={() => setModal("auth")} />
            ) : (
              <>
                <div className="panel planner-intro">
                  <div>
                    <h2>Your week, thoughtfully planned.</h2>
                    <p>
                      Three meals a day, matched to your diet and allergens.
                      <br />
                      Portions scale toward your{" "}
                      {data.user.daily_calorie_target} kcal daily target.
                    </p>
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await post(
                          "plan",
                          { start_date: f.get("start_date") },
                          "Your week is ready",
                        )
                      )
                        refreshPlans();
                    }}
                  >
                    <label>
                      Week starting
                      <input
                        name="start_date"
                        type="date"
                        required
                        defaultValue={new Date().toLocaleDateString("en-CA")}
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      <CalendarDays size={16} />{" "}
                      {busy ? "Planning…" : "Generate my week"}
                    </button>
                  </form>
                </div>
                {plans.length === 0 && (
                  <div className="empty">
                    <CalendarDays size={40} />
                    <h3>Good weeks start with a little inspiration.</h3>
                    <p>Choose a start date to create your first meal plan.</p>
                  </div>
                )}
                {plans.map((p) => (
                  <section className="plan panel" key={p.plan_id}>
                    <div className="section-row">
                      <h2>{p.plan_name}</h2>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await post(
                              "plan-delete",
                              { plan_id: p.plan_id },
                              "Plan removed",
                            )
                          )
                            refreshPlans();
                        }}
                      >
                        Remove plan
                      </button>
                    </div>
                    <div className="week-grid">
                      {Array.from(
                        new Set(p.meals.map((m: Row) => m.meal_date)),
                      ).map((date: any) => (
                        <div className="day" key={date}>
                          <h3>
                            {new Date(date + "T12:00:00").toLocaleDateString(
                              "en-IN",
                              {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              },
                            )}
                          </h3>
                          {p.meals
                            .filter((m: Row) => m.meal_date === date)
                            .map((m: Row) => (
                              <button
                                key={m.meal_type}
                                onClick={() =>
                                  openRecipe(
                                    data.recipes.find(
                                      (r: Row) => r.recipe_id === m.recipe_id,
                                    ),
                                  )
                                }
                              >
                                <span>{m.meal_type}</span>
                                <strong>{m.title}</strong>
                                <small>
                                  {m.servings_planned} servings ·{" "}
                                  {Math.round(
                                    m.servings_planned * m.calories_per_serving,
                                  )}{" "}
                                  kcal
                                </small>
                              </button>
                            ))}
                          <b>
                            {Math.round(
                              p.meals
                                .filter((m: Row) => m.meal_date === date)
                                .reduce(
                                  (s: number, m: Row) =>
                                    s +
                                    m.calories_per_serving * m.servings_planned,
                                  0,
                                ),
                            )}{" "}
                            kcal / day
                          </b>
                        </div>
                      ))}
                    </div>
                    <details>
                      <summary>Shopping list for this week</summary>
                      <div className="shopping">
                        {(() => {
                          const sums = new Map<string, number>();
                          for (const m of p.meals) {
                            const r = data.recipes.find(
                              (r: Row) => r.recipe_id === m.recipe_id,
                            );
                            r?.ingredients.forEach((i: Row) =>
                              sums.set(
                                i.name,
                                (sums.get(i.name) || 0) +
                                  (i.quantity * m.servings_planned) /
                                    r.servings,
                              ),
                            );
                          }
                          return [...sums].map(([name, q]) => (
                            <label key={name}>
                              <input type="checkbox" />
                              {name}
                              <strong>{Math.ceil(q)} g</strong>
                            </label>
                          ));
                        })()}
                      </div>
                    </details>
                  </section>
                ))}
              </>
            ))}
          <footer>
            <span className="footer-brand">
              <Leaf size={14} /> A little inspiration. A healthier everyday.
            </span>
            <span>Made with care, for your kitchen.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss message">
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className={"modal " + (modal === "detail" ? "detail-modal" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "auth"
                ? "Account"
                : modal === "recipe"
                  ? "Recipe editor"
                  : selected?.title
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            {modal === "auth" && (
              <>
                <div className="modal-icon">
                  <Utensils />
                </div>
                <h2>
                  {register
                    ? "A seat at your own table."
                    : "Welcome to your kitchen."}
                </h2>
                <p>
                  Save favorites, discover your fit, and plan a delicious week.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      await post(
                        "auth",
                        {
                          mode: register ? "register" : "login",
                          name: f.get("name"),
                          email: f.get("email"),
                          password: f.get("password"),
                        },
                        "Welcome to RecipeRadar",
                      )
                    )
                      setModal(null);
                  }}
                >
                  {register && (
                    <label>
                      Name
                      <input name="name" required maxLength={100} />
                    </label>
                  )}
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={register ? "" : "demo@reciperadar.app"}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      defaultValue={register ? "" : "RecipeRadar123!"}
                    />
                  </label>
                  <button className="primary full" disabled={busy}>
                    {register ? "Create account" : "Sign in"}
                    <ArrowRight size={16} />
                  </button>
                </form>
                <button
                  className="text-button"
                  onClick={() => setRegister(!register)}
                >
                  {register
                    ? "Already have an account? Sign in"
                    : "New here? Create an account"}
                </button>
                <p className="muted">
                  Try the prefilled demo account to explore.
                </p>
              </>
            )}
            {modal === "recipe" && (
              <>
                <h2>
                  {draft.recipe_id
                    ? "Refine your recipe."
                    : "Something delicious starts here."}
                </h2>
                <p>Add your own recipe to the community kitchen.</p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await post(
                        "recipe",
                        {
                          ...draft,
                          instructions: draft.instructions
                            .split("\n")
                            .filter((s: string) => s.trim()),
                        },
                        "Recipe saved",
                      )
                    )
                      setModal(null);
                  }}
                >
                  <label>
                    Recipe title
                    <input
                      required
                      maxLength={200}
                      value={draft.title}
                      onChange={(e) => field("title", e.target.value)}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      required
                      value={draft.description}
                      onChange={(e) => field("description", e.target.value)}
                    />
                  </label>
                  <div className="form-grid">
                    {[
                      ["prep_time_minutes", "Prep (min)"],
                      ["cook_time_minutes", "Cook (min)"],
                      ["servings", "Servings"],
                      ["calories_per_serving", "Calories / serving"],
                      ["protein_g", "Protein (g)"],
                      ["carbs_g", "Carbs (g)"],
                      ["fat_g", "Fat (g)"],
                    ].map(([k, label]) => (
                      <label key={k}>
                        {label}
                        <input
                          type="number"
                          min={
                            k === "servings" || k === "calories_per_serving"
                              ? 1
                              : 0
                          }
                          required
                          value={draft[k]}
                          onChange={(e) => field(k, e.target.value)}
                        />
                      </label>
                    ))}
                    <label>
                      Cuisine
                      <select
                        value={draft.cuisine_id}
                        onChange={(e) => field("cuisine_id", e.target.value)}
                      >
                        {data.cuisines.map((c: Row) => (
                          <option key={c.cuisine_id} value={c.cuisine_id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Diet
                      <select
                        value={draft.diet_id}
                        onChange={(e) => field("diet_id", e.target.value)}
                      >
                        {data.diets.map((d: Row) => (
                          <option key={d.diet_id} value={d.diet_id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Meal
                      <select
                        value={draft.meal_type}
                        onChange={(e) => field("meal_type", e.target.value)}
                      >
                        {["Breakfast", "Lunch", "Dinner"].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <h3>Ingredients for the full recipe</h3>
                  {draft.ingredients.map((i: Row, n: number) => (
                    <div className="ingredient-row" key={n}>
                      <select
                        aria-label={"Ingredient " + (n + 1)}
                        value={i.ingredient_id}
                        onChange={(e) =>
                          field(
                            "ingredients",
                            draft.ingredients.map((x: Row, j: number) =>
                              j === n
                                ? {
                                    ...x,
                                    ingredient_id: Number(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {data.ingredients.map((x: Row) => (
                          <option key={x.ingredient_id} value={x.ingredient_id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Quantity in grams"
                        type="number"
                        min="1"
                        required
                        value={i.quantity}
                        onChange={(e) =>
                          field(
                            "ingredients",
                            draft.ingredients.map((x: Row, j: number) =>
                              j === n
                                ? { ...x, quantity: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                      <span>g</span>
                      <button
                        type="button"
                        aria-label="Remove ingredient"
                        onClick={() =>
                          field(
                            "ingredients",
                            draft.ingredients.filter(
                              (_: any, j: number) => j !== n,
                            ),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      const next = data.ingredients.find(
                        (i: Row) =>
                          !draft.ingredients.some(
                            (d: Row) => d.ingredient_id === i.ingredient_id,
                          ),
                      );
                      if (next)
                        field("ingredients", [
                          ...draft.ingredients,
                          { ingredient_id: next.ingredient_id, quantity: 100 },
                        ]);
                    }}
                  >
                    + Add ingredient
                  </button>
                  <label>
                    Instructions (one step per line)
                    <textarea
                      required
                      rows={5}
                      value={draft.instructions}
                      onChange={(e) => field("instructions", e.target.value)}
                    />
                  </label>
                  <button className="primary full" disabled={busy}>
                    Save recipe <Check size={16} />
                  </button>
                </form>
              </>
            )}
            {modal === "detail" && selected && (
              <>
                <div className="detail-image">
                  {selected.image && (
                    <img src={selected.image} alt={selected.title} />
                  )}
                </div>
                <div className="detail-content">
                  <div className="eyebrow">
                    {selected.cuisine} · {selected.diet}
                  </div>
                  <h2>{selected.title}</h2>
                  <p>{selected.description}</p>
                  <div className="detail-stats">
                    <span>
                      <Clock size={16} />
                      {selected.prep_time_minutes +
                        selected.cook_time_minutes}{" "}
                      min
                    </span>
                    <span>
                      <Flame size={16} />
                      {selected.calories_per_serving} kcal / serving
                    </span>
                    <span>{selected.servings} servings</span>
                  </div>
                  {selected.allergens.length > 0 && (
                    <div className="allergen-notice">
                      <ShieldCheck size={18} />
                      <span>
                        Contains:{" "}
                        {selected.allergens.map((a: Row) => a.name).join(", ")}
                        {selected.conflicts.length > 0 && (
                          <strong> · Matches your allergen profile</strong>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="macros">
                    {[
                      ["Protein", selected.protein_g],
                      ["Carbs", selected.carbs_g],
                      ["Fat", selected.fat_g],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <strong>{v}g</strong>
                        <span>{k} / serving</span>
                      </div>
                    ))}
                  </div>
                  <div className="detail-columns">
                    <div>
                      <h3>What you’ll need</h3>
                      <p className="muted">For {selected.servings} servings</p>
                      {selected.ingredients.map((i: Row) => (
                        <div className="ingredient-line" key={i.ingredient_id}>
                          <span>{i.name}</span>
                          <b>
                            {i.quantity} {i.unit}
                          </b>
                        </div>
                      ))}
                    </div>
                    <div>
                      <h3>Let’s make it</h3>
                      {selected.instructions.map((s: string, i: number) => (
                        <div className="step" key={i}>
                          <span>{i + 1}</span>
                          <p>{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="section-row">
                    <button
                      className="outline"
                      onClick={() => {
                        if (!authNeeded())
                          post(
                            "favorite",
                            { recipe_id: selected.recipe_id },
                            "Saved recipes updated",
                          );
                      }}
                    >
                      <Heart size={16} /> Save recipe
                    </button>
                    {selected.created_by === data.user?.user_id && (
                      <>
                        <button
                          className="text-button"
                          onClick={() => editRecipe(selected)}
                        >
                          Edit recipe
                        </button>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await post(
                                "recipe-delete",
                                { recipe_id: selected.recipe_id },
                                "Recipe deleted",
                              )
                            )
                              setModal(null);
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  <h3>More like this</h3>
                  <div className="similar">
                    {data.recipes
                      .filter(
                        (r: Row) =>
                          r.recipe_id !== selected.recipe_id &&
                          !r.conflicts.length,
                      )
                      .map((r: Row) => {
                        const a = new Set(selected.flavor.split(" "));
                        const b = new Set(r.flavor.split(" "));
                        const union = new Set([...a, ...b]);
                        const overlap = [...a].filter((x) => b.has(x)).length;
                        return {
                          ...r,
                          score: Math.round((overlap / union.size) * 100),
                        };
                      })
                      .sort((a: Row, b: Row) => b.score - a.score)
                      .slice(0, 3)
                      .map((r: Row) => (
                        <button key={r.recipe_id} onClick={() => openRecipe(r)}>
                          {r.title}
                          <small>{r.score}% flavor similarity</small>
                        </button>
                      ))}
                  </div>
                  <h3>From the community</h3>
                  {reviews.map((r, i) => (
                    <div className="review" key={i}>
                      <strong>
                        {r.name} · {"★".repeat(r.rating_value)}
                      </strong>
                      <p>{r.review_text}</p>
                    </div>
                  ))}
                  {!reviews.length && (
                    <p className="muted">Be the first to share how it went.</p>
                  )}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (authNeeded()) return;
                      const f = new FormData(e.currentTarget);
                      if (
                        await post(
                          "rating",
                          {
                            recipe_id: selected.recipe_id,
                            rating: Number(f.get("rating")),
                            review: f.get("review"),
                          },
                          "Thanks for sharing",
                        )
                      ) {
                        fetch("/api/reviews/" + selected.recipe_id)
                          .then((r) => r.json())
                          .then(setReviews);
                      }
                    }}
                  >
                    <label>
                      Your rating
                      <select name="rating">
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} stars
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Your review
                      <textarea
                        name="review"
                        maxLength={2000}
                        placeholder="How did it turn out?"
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Share review
                    </button>
                  </form>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function SignIn({ onClick }: { onClick: () => void }) {
  return (
    <div className="empty panel">
      <Leaf size={36} />
      <h2>Your personal kitchen is waiting.</h2>
      <p>Sign in to save preferences and plan your week.</p>
      <button className="primary" onClick={onClick}>
        Sign in <ArrowRight size={16} />
      </button>
    </div>
  );
}
