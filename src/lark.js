// src/lark.js
// 飞书 OpenAPI 封装：tenant_access_token + 读多维表格记录
// Cloudflare Workers 内置 fetch，无依赖

const LARK_API = 'https://open.feishu.cn/open-apis';

export async function getTenantAccessToken(appId, appSecret) {
  const res = await fetch(`${LARK_API}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`getTenantAccessToken failed: ${data.msg}`);
  }
  return data.tenant_access_token;
}

export async function listAllRecords(token, baseToken, tableId) {
  const all = [];
  let pageToken = null;

  do {
    const url = new URL(
      `${LARK_API}/bitable/v1/apps/${baseToken}/tables/${tableId}/records`
    );
    url.searchParams.set('page_size', '500');
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(`list records failed: ${data.msg}`);
    }
    all.push(...(data.data?.items || []));
    pageToken = data.data?.has_more ? data.data.page_token : null;
  } while (pageToken);

  return all;
}
