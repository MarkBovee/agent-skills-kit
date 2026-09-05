window.__ModuleLoader__.load({
	// dsh serves client modules through one aggregate URL, so currentScript cannot identify this roster entry.
	id: "ask-kit-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");

		const PROJECTION_KEY = "askKit";
		const SLOT_NAME = "conversation.composer.dock";
		const SLOT_ID = "ask-kit-status";
		const STYLE_TAG_ID = "ask-kit-panel/status.css";
		const CSS = [
			".askk-shell{position:relative;display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:3px 6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}",
			".askk-summary{display:flex;align-items:center;gap:8px;min-width:0;flex:1}",
			".askk-brand{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;color:var(--dsw-alias-label-primary);font-weight:650;letter-spacing:-.01em}",
			".askk-mark{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent);border-radius:6px;color:var(--dsw-alias-brand-primary);font-size:10px;font-weight:750}",
			".askk-status{display:inline-flex;align-items:center;gap:5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".askk-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}",
			".askk-dot.warn{background:var(--dsw-alias-state-warn-primary)}",
			".askk-count{color:var(--dsw-alias-label-secondary);white-space:nowrap}",
			".askk-toggle{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:28px;padding:4px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;transition:border-color 160ms ease,background 160ms ease,color 160ms ease}",
			".askk-toggle:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}",
			".askk-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
			".askk-chevron{font-size:10px;transition:transform 160ms ease}.askk-chevron.open{transform:rotate(180deg)}",
			".askk-popover{position:absolute;right:6px;bottom:calc(100% + 8px);z-index:20;width:min(360px,calc(100vw - 24px));padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 32px color-mix(in srgb,#000 22%,transparent);color:var(--dsw-alias-label-primary)}",
			".askk-popover h3{margin:0;font-size:13px;line-height:18px;font-weight:700}.askk-popover p{margin:3px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}",
			".askk-section{margin-top:13px}.askk-section-title{margin-bottom:6px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:650;letter-spacing:.02em}",
			".askk-action,.askk-history{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px}.askk-action:first-of-type{border-top:0}",
			".askk-action-icon{color:var(--dsw-alias-state-warn-primary);font-weight:800}.askk-action-copy{min-width:0}.askk-action-copy strong{display:block;font-weight:650}.askk-action-copy span{display:block;margin-top:2px;color:var(--dsw-alias-label-secondary)}",
			".askk-history{display:inline-flex;flex-wrap:wrap;gap:5px;border-top:0;padding-top:0}.askk-chip{display:inline-flex;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}",
			"@media (max-width:520px){.askk-brand span:last-child{display:none}.askk-count{display:none}.askk-shell{padding-inline:2px}.askk-popover{right:0;width:min(360px,calc(100vw - 12px))}}",
			"@media (prefers-reduced-motion:reduce){.askk-toggle,.askk-chevron{transition:none}}",
		].join("");

		/** Insert package-local styles once without touching the host document body. */
		function insertCss() {
			try {
				if (typeof document === "undefined" || document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]')) return;
				var tag = document.createElement("style");
				tag.dataset.plugin = "ask-kit-panel";
				tag.dataset.pluginCss = STYLE_TAG_ID;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			} catch { /* cosmetic styling must never block the widget */ }
		}

		/** Normalize projection data at the rendering boundary so malformed logs stay hidden and harmless. */
		function normalizeView(value) {
			if (!value || typeof value !== "object") return null;
			var loadedSkills = Array.isArray(value.loadedSkills)
				? [...new Set(value.loadedSkills.filter((skill) => typeof skill === "string" && skill.trim()))].slice(-6)
				: [];
			return {
				loadedSkills,
				lastMatch: typeof value.lastMatch === "string" ? value.lastMatch : "",
				needsCodeReview: value.needsCodeReview === true,
				needsDesignReview: value.needsDesignReview === true,
				shouldCaptureImprovement: value.shouldCaptureImprovement === true,
			};
		}

		/** Resolve the live session projection face while tolerating older or incomplete client contracts. */
		function faceFor(sessions, sessionId) {
			if (!sessions || typeof sessions.binding !== "function" || typeof sessionId !== "string") return undefined;
			try {
				var projections = sessions.binding(sessionId)?.session?.projections;
				if (!projections || typeof projections.faceOf !== "function") return undefined;
				var face = projections.faceOf(PROJECTION_KEY);
				return face && typeof face.getSnapshot === "function" ? face : undefined;
			} catch { return undefined; }
		}

		/** Subscribe the component to the projection as an external store without polling or duplicate state. */
		function useProjectionValue(faceFactory) {
			var [value, setValue] = react.useState(() => { try { var face = faceFactory(); return face ? face.getSnapshot() : undefined; } catch { return undefined; } });
			react.useEffect(() => {
				var alive = true;
				var unsubscribe;
				try {
					var face = faceFactory();
					if (face) {
						setValue(face.getSnapshot());
						if (typeof face.subscribe === "function") unsubscribe = face.subscribe(() => { if (alive) { try { setValue(face.getSnapshot()); } catch { /* retry on the next projection event */ } } });
					}
				} catch { /* absent projection means the panel stays hidden */ }
				return () => { alive = false; try { if (typeof unsubscribe === "function") unsubscribe(); } catch { /* projection already disposed */ } };
			}, [faceFactory]);
			return value;
		}

		/** Build the actionable review list while keeping status labels consistent with the router state. */
		function actionsFor(view) {
			var actions = [];
			if (view.needsCodeReview) actions.push({ id: "code-review", title: "Code review nodig", detail: "Er is code gewijzigd sinds de vorige review." });
			if (view.needsDesignReview) actions.push({ id: "design-review", title: "Design review nodig", detail: "Controleer de UI op bruikbaarheid en AI-defaults." });
			if (view.shouldCaptureImprovement) actions.push({ id: "session-review", title: "Verbetering vastleggen", detail: "Er is een workflowverbetering gesignaleerd." });
			return actions;
		}

		/** Render the compact summary and an accessible details popover for one session. */
		function StatusPanel(props, sessions) {
			var sessionId = props?.session?.sessionId;
			var [open, setOpen] = react.useState(false);
			var sessionsRef = react.useRef(sessions);
			sessionsRef.current = sessions;
			var faceFactory = react.useCallback(() => faceFor(sessionsRef.current, sessionId), [sessionId]);
			var view = normalizeView(useProjectionValue(faceFactory));
			if (!view) return null;
			var actions = actionsFor(view);
			var active = view.lastMatch || view.loadedSkills[view.loadedSkills.length - 1] || "klaar";
			var statusText = actions.length ? actions[0].title : active;
			var toggleLabel = open ? "ASK-details sluiten" : "ASK-details openen";
			var details = open ? react.createElement("div", { id: SLOT_ID + "-details", className: "askk-popover", role: "region", "aria-label": "ASK details" },
				react.createElement("h3", null, "Agent Skills Kit"),
				react.createElement("p", null, view.lastMatch ? "Actieve context: " + view.lastMatch : "Live sessiecontext"),
				actions.length ? react.createElement("div", { className: "askk-section" },
					react.createElement("div", { className: "askk-section-title" }, "OPEN ACTIES"),
					actions.map((action) => react.createElement("div", { className: "askk-action", key: action.id },
						react.createElement("span", { className: "askk-action-icon", "aria-hidden": "true" }, "!"),
						react.createElement("div", { className: "askk-action-copy" }, react.createElement("strong", null, action.title), react.createElement("span", null, action.detail)))))
					: react.createElement("div", { className: "askk-section" }, react.createElement("div", { className: "askk-section-title" }, "STATUS"), react.createElement("p", null, "Geen open acties. De sessie is klaar voor de volgende stap.")),
				view.loadedSkills.length ? react.createElement("div", { className: "askk-section" },
					react.createElement("div", { className: "askk-section-title" }, "RECENT GELADEN"),
					react.createElement("div", { className: "askk-history" }, view.loadedSkills.map((skill) => react.createElement("span", { className: "askk-chip", key: skill, title: skill }, skill)))) : null) : null;
			return react.createElement("div", { className: "askk-shell" },
				react.createElement("div", { className: "askk-summary" },
					react.createElement("span", { className: "askk-brand" }, react.createElement("span", { className: "askk-mark", "aria-hidden": "true" }, "A"), react.createElement("span", null, "ASK")),
					react.createElement("span", { className: "askk-status", title: statusText }, react.createElement("span", { className: "askk-dot" + (actions.length ? " warn" : ""), "aria-hidden": "true" }), statusText),
					actions.length ? react.createElement("span", { className: "askk-count" }, actions.length + (actions.length === 1 ? " open actie" : " open acties")) : null),
				react.createElement("button", { type: "button", className: "askk-toggle", onClick: () => setOpen(!open), "aria-expanded": open, "aria-controls": SLOT_ID + "-details", "aria-label": toggleLabel }, "Details", react.createElement("span", { className: "askk-chevron" + (open ? " open" : ""), "aria-hidden": "true" }, "⌄")), details);
		}

		/** Register the projection-backed widget in the additive composer dock slot. */
		function apply(ctx) {
			insertCss();
			var slots;
			var sessions;
			try { slots = ctx.slots; sessions = ctx.sessions; } catch { return; }
			if (slots === undefined || sessions === undefined) return;
			slots.inject(SLOT_NAME, () => slots.register({ name: SLOT_NAME, id: SLOT_ID, order: 50 }, (props) => StatusPanel(props, sessions)));
		}

		exports.apply = apply;
		exports.inject = ["slots", "sessions"];
		return module.exports;
	}
});
