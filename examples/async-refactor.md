### Step 1 · Raw callbacks

```ts src/fetchData.ts
function getDashboard(id: string, cb: (err: Error | null, data?: any) => void) {
  fetchUser(id, (err, user) => {
    if (err) return cb(err);
    fetchMetrics(user.orgId, (mErr, metrics) => {
      if (mErr) return cb(mErr);
      cb(null, { user, metrics });
    });
  });
}
```

### Step 2 · Clean async/await + Promise.all

```ts src/fetchData.ts
async function getDashboard(id: string): Promise<Dashboard> {
  const user = await fetchUser(id);
  const [metrics, alerts] = await Promise.all([
    fetchMetrics(user.orgId),
    fetchAlerts(user.orgId),
  ]);
  return { user, metrics, alerts };
}
```
