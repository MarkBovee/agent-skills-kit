window.__ModuleLoader__.load({
	// client-modules bundles do not execute with a stable currentScript URL.
	// Keep this equal to package.json.name and the managed roster row id.
	id: "ask-kit-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react = require("react");
		//#region ask-kit-panel client — compact ASK routing status under the composer.
		// Semantic state arrives completed from router-core via the `askKit` session
		// projection (host fold of `ask-kit/state` whole-value events written
		// by the ask-kit router row); this widget only presents that snapshot.
		const PROJECTION_KEY = "askKit";
		const SLOT_NAME = "conversation.composer.dock";
		const SLOT_ID = "ask-kit-status";
		const STYLE_TAG_ID = "ask-kit-panel/status.css";
		const CSS = ".askk-panel{min-width:200px;padding:8px 4px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.45}" +
			".askk-title{color:var(--dsw-alias-brand-primary);font-size:12px;font-weight:600;margin-bottom:9px}" +
			".askk-label{color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:600;letter-spacing:.06em;margin-top:8px}" +
			".askk-value{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}" +
			".askk-route{border-top:1px solid var(--dsw-alias-border-l1);margin-top:3px;padding-top:4px}" +
			".askk-phase{white-space:nowrap}" +
			".askk-phase-active{color:var(--dsw-alias-label-primary);font-weight:600}" +
			".askk-empty{color:var(--dsw-alias-label-tertiary)}";
		/**
		* Insert the panel stylesheet once, shipped-package style, so HMR
		* bookkeeping can find and remove the tag again.
		*/
		function insertCss() {
			try {
				if (typeof document === "undefined") return;
				if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') !== null) return;
				const tag = document.createElement("style");
				tag.dataset.plugin = "ask-kit-panel";
				tag.dataset.pluginCss = STYLE_TAG_ID;
				tag.textContent = CSS;
				document.head.appendChild(tag);
			} catch { /* styling is cosmetic; never block activation */ }
		}
		/**
		* Coerce a router-owned snapshot into a safe render shape. This validates
		* completed state only; it never derives skill, workflow, or obligations.
		* @param value - whole projection view or undefined/null.
		* @returns normalized view object, or null when there is nothing to show.
		*/
		function normalizeView(value) {
			if (!value || typeof value !== "object") return null;
			const route = Array.isArray(value.workflow?.route)
				? value.workflow.route.filter((entry) => entry && typeof entry.phase === "string" && ["completed", "active", "pending"].includes(entry.state))
				: [];
			const pending = Array.isArray(value.pending)
				? value.pending.filter((entry) => entry && typeof entry.label === "string" && entry.label.trim()).map((entry) => entry.label)
				: [];
			return {
				activeSkillLabel: typeof value.activeSkillLabel === "string" && value.activeSkillLabel ? value.activeSkillLabel : null,
				route,
				pending,
			};
		}
		/**
		* Resolve the observable projection face for one session, tolerating
		* every rc-stage contract gap (no binding, no projections store, old
		* face shape) by returning undefined.
		* @param sessions - the client sessions service.
		* @param sessionId - active session id or undefined.
		* @returns {getSnapshot,subscribe} face, or undefined.
		*/
		function faceFor(sessions, sessionId) {
			if (!sessions || typeof sessions.binding !== "function" || typeof sessionId !== "string") return undefined;
			try {
				const projections = sessions.binding(sessionId)?.session?.projections;
				if (projections === undefined || typeof projections.faceOf !== "function") return undefined;
				const face = projections.faceOf(PROJECTION_KEY);
				if (face === undefined || typeof face.getSnapshot !== "function") return undefined;
				return face;
			} catch { return undefined }
		}
		/**
		* Subscribe one component to the projection value for a session. A hand-
		* rolled external-store subscription (instead of useSyncExternalStore)
		* keeps working on older React builds and never throws on contract gaps.
		* @param faceFactory - stable zero-arg resolver for the current face.
		* @returns the latest snapshot value (undefined while absent).
		*/
		function useProjectionValue(faceFactory) {
			const [value, setValue] = react.useState(() => {
				try {
					const face = faceFactory();
					return face ? face.getSnapshot() : undefined;
				} catch { return undefined }
			});
			react.useEffect(() => {
				let alive = true;
				let unsubscribe;
				try {
					const face = faceFactory();
					setValue(undefined);
					if (face) {
						setValue(face.getSnapshot());
						if (typeof face.subscribe === "function") {
							unsubscribe = face.subscribe(() => {
								if (!alive) return;
								try { setValue(face.getSnapshot()) } catch { /* next frame retries */ }
							});
						}
					}
				} catch { /* capability absent: stay hidden */ }
				return () => {
					alive = false;
					try { if (typeof unsubscribe === "function") unsubscribe() } catch { /* already gone */ }
				};
			}, [faceFactory]);
			return value;
		}
		/**
		* Compact dock entry for router-owned routing status, hidden until the
		* session carries an askKit projection value.
		* @param props - slot props ({session, input}); only session.sessionId is read.
		* @param sessions - captured client sessions service.
		*/
		function StatusPanel(props, sessions) {
			const sessionId = props?.session?.sessionId;
			const sessionsRef = react.useRef(sessions);
			sessionsRef.current = sessions;
			const faceFactory = react.useCallback(() => faceFor(sessionsRef.current, sessionId), [sessionId]);
			const raw = useProjectionValue(faceFactory);
			const data = normalizeView(raw);
			if (!data) return null;
			const phases = data.route.length > 0
				? data.route.map((entry) => react.createElement("div", { className: "askk-phase" + (entry.state === "active" ? " askk-phase-active" : ""), key: entry.phase },
					entry.state === "pending" ? "○ " : "● ", entry.phase.charAt(0) + entry.phase.slice(1).toLowerCase().replace(/_/g, " ")))
				: react.createElement("div", { className: "askk-empty" }, "No workflow");
			const pending = data.pending.length > 0
				? [
					react.createElement("div", { className: "askk-label", key: "pending-label" }, "PENDING"),
					react.createElement("div", { className: "askk-route", key: "pending-list" },
						data.pending.map((label) => react.createElement("div", { className: "askk-phase", key: label }, "→ " + label))),
				]
				: null;
			return react.createElement("section", { className: "askk-panel", "aria-label": "Agent Skills Kit status" },
				react.createElement("div", { className: "askk-title" }, "Agent Skills Kit"),
				react.createElement("div", { className: "askk-label" }, "ACTIVE SKILL"),
				react.createElement("div", { className: data.activeSkillLabel ? "askk-value" : "askk-empty" }, data.activeSkillLabel || "Not matched"),
				react.createElement("div", { className: "askk-label" }, "ROUTING"),
				react.createElement("div", { className: "askk-route" }, phases),
				pending);
		}
		/**
		* Client plugin body: stylesheet plus the composer dock registration.
		* @param ctx - client root context (slots + sessions services expected).
		*/
		function apply(ctx) {
			insertCss();
			let slots;
			let sessions;
			try {
				slots = ctx.slots;
				sessions = ctx.sessions;
			} catch { return }
			if (slots === undefined || sessions === undefined) return;
			slots.inject(SLOT_NAME, () => slots.register(
				{ name: SLOT_NAME, id: SLOT_ID, order: 50 },
				(props) => StatusPanel(props, sessions),
			));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = ["slots", "sessions"];
		return module.exports;
	}
});
