import React, { useEffect, useState } from "react";
import { Badge } from "antd";
import { supabaseClient } from "../providers/supabase-client";
import { API_BASE_URL } from "../providers/constants";

export const SupportMenuLabel: React.FC = () => {
  const [count, setCount] = useState<{ total: number; open: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/admin/feedback/count`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!cancelled && json.status === "success" && json.data) setCount(json.data);
      } catch {
        // ignore
      }
    };
    fetchCount();
    const t = setInterval(fetchCount, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const openCount = count?.open ?? 0;
  const totalCount = count?.total ?? 0;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span>Support</span>
      {(totalCount > 0 || openCount > 0) && (
        <Badge
          count={openCount > 0 ? openCount : totalCount}
          size="small"
          style={{ backgroundColor: openCount > 0 ? "#ef4444" : undefined }}
        />
      )}
    </span>
  );
};
