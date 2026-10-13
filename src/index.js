// src/index.js
// Cloudflare Workers 入口：飞书字段捷径端点
// 部署后默认路径：POST https://<你的域名>/  (Cloudflare 会把 src/index.js 的 default fetch 绑到根路径)
import { getTenantAccessToken, listAllRecords } from './lark.js';
import { haversine } from './geo.js';

const DEFAULT_RADIUS_KM = 5;
const MAX_OPTIONS = 50;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      const body = await request.json().catch(() => ({}));

      // 兼容两种入参：
      // 1. 飞书字段捷径官方协议：{ record: { fields: { 当前位置纬度, 当前位置经度, ... } } }
      // 2. 直接 POST（本地调试）：{ lat, lng, radius }
      const f = body.record?.fields || {};
      const lat = f['当前位置纬度'] ?? body.lat;
      const lng = f['当前位置经度'] ?? body.lng;
      const radius = Number(body.radius ?? DEFAULT_RADIUS_KM);

      if (lat == null || lng == null) {
        return jsonResponse(
          {
            code: -1,
            msg: 'lat/lng required (record.fields.当前位置经度/当前位置纬度 或 body.lat/lng)',
          },
          400
        );
      }

      // 1) 拿 tenant_access_token
      const token = await getTenantAccessToken(env.APP_ID, env.APP_SECRET);

      // 2) 读「坐标点」表全量数据
      const records = await listAllRecords(
        token,
        env.BASE_TOKEN,
        env.TABLE_ID
      );

      // 3) 计算距离，过滤 radius 内的，按距离升序
      const enriched = records
        .map((r) => {
          const rf = r.fields || {};
          const distance = haversine(lat, lng, rf['纬度'], rf['经度']);
          return {
            record_id: r.record_id,
            name: rf['名称'] || '未命名',
            address: rf['地址'] || '',
            city: rf['城市'] || '',
            type: Array.isArray(rf['类型']) ? rf['类型'][0] : '',
            distance,
          };
        })
        .filter((r) => r.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, MAX_OPTIONS);

      // 4) 按飞书字段捷径协议返回
      return jsonResponse({
        code: 0,
        msg: 'success',
        data: {
          options: enriched.map((r) => ({
            label: `${r.name}（${r.distance.toFixed(2)} km）`,
            value: r.record_id,
          })),
          items: enriched,
          total: enriched.length,
          radius_km: radius,
        },
      });
    } catch (err) {
      console.error('[options] error:', err);
      return jsonResponse(
        { code: -1, msg: err.message || String(err) },
        500
      );
    }
  },
};
