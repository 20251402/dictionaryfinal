// Netlify Function — Express 앱을 serverless-http로 감싸고,
// 요청마다 Netlify Blobs에서 데이터(계정·검색기록)를 로드 → 처리 → 변경 시 저장한다.
import serverless from "serverless-http";
import { getStore } from "@netlify/blobs";
import { createApp } from "../../lib/app.js";
import { makeStore, emptyData } from "../../lib/store.js";

// 요청마다 교체되는 데이터 객체(웜 인스턴스는 요청을 직렬 처리하므로 안전)
const STATE = { data: emptyData() };
const store = makeStore(() => STATE.data);
const app = createApp({ store, env: process.env, serveStatic: false });
const sls = serverless(app);

const blob = () => getStore({ name: "dict-db", consistency: "strong" });
async function load() {
  try { const v = await blob().get("db", { type: "json" }); return (v && v.users) ? v : emptyData(); }
  catch { return emptyData(); }
}
async function save(data) {
  try { const c = { ...data }; delete c._dirty; await blob().setJSON("db", c); }
  catch (e) { console.error("[blob save]", e.message); }
}

export const handler = async (event, context) => {
  // 원본 요청 경로 보장(리라이트로 들어와도 Express가 실제 경로를 보도록)
  if (event.rawUrl) { try { event.path = new URL(event.rawUrl).pathname; } catch { } }
  STATE.data = await load();
  try { store.purgeExpired?.(); } catch { }       // 30일 지난 휴지통 정리
  const res = await sls(event, context);
  if (STATE.data._dirty) await save(STATE.data);
  return res;
};
