# Phase 2 — DB near real-time : logical replication Supabase → VPS

État : **roadmap**, à activer POST cutover Phase 6. Pas dans V97.39.x.

## Pour quoi

Paul (2026-05-17) a demandé : "vu que je suis sur serveur OVH on pourrait passer la base de données en presque full real-time plus tard ?"

Réponse : **oui, totalement faisable**. C'est l'avantage du self-host vs Supabase managé. 3 approches en V2/V3 (V1 = sync horaire script via cron, déjà actif).

## V1 (livré V97.39.24) — Sync horaire script

- `tools/postgres-vps/scripts/sync-shadow.sh` : pg_dump tables public Supabase → COPY pipe → TRUNCATE+COPY VPS
- Cron systemd : `keymatch-shadow-sync.timer` toutes les heures à HH:15
- Latency : 1h max (data perdue si crash entre 2 syncs)
- Risque : 0 (script lit Supabase en read-only)
- Use case : maintenir le shadow VPS frais pendant la fenêtre de transition

## V2 — Logical replication WAL streaming (post Phase 2 cutover)

**Quand** : après Phase 6 cutover Next.js, quand on commence à faire confiance au VPS.

**Setup** :
1. Activer `wal_level=logical` côté Supabase (Dashboard → Database → Replication). Nécessite un restart du projet Supabase (~30s downtime).
2. Côté Supabase : `CREATE PUBLICATION keymatch_pub FOR ALL TABLES;`
3. Côté Postgres VPS : `wal_level=logical` déjà OK (Postgres 17 défaut).
4. Côté Postgres VPS : `CREATE SUBSCRIPTION keymatch_sub CONNECTION 'postgresql://...supabase...' PUBLICATION keymatch_pub;`
5. Snapshot initial transféré (~30s pour 17 MB), puis stream continu via WAL.
6. Latency : **<1s** typiquement, parfois <100ms.

**Sécurité** :
- Connexion Supabase → VPS chiffrée TLS (sslmode=require dans la connection string)
- User Postgres VPS dédié `keymatch_replicator` avec REPLICATION privilege (pas keymatch app)
- Firewall : autoriser uniquement les IPs Supabase pooler dans UFW

**Coût** : 0€. Supabase facture le WAL streaming au-delà de 2 GB/jour — KeyMatch fait <100 MB/jour, large marge.

## V3 — Bidirectional replication (logical multi-master) — futur

**Quand** : si on veut une période de **dual-write** robuste (Vercel écrit Supabase, VPS lit + applique aux 2 bases en parallèle).

**Approche** : `pglogical` extension ou `BDR` (Bi-Directional Replication, comme MariaDB Galera).

⚠ Complexe à setup, conflits de PK possibles. Pas utile sauf si on veut zero-downtime cutover Phase 2 pendant 30 jours.

## V4 — Read replicas VPS (post Phase 6 scale)

**Quand** : si KeyMatch dépasse 100 RPS sustained (loin du palier actuel).

**Setup** :
1. 2ème container Postgres sur le même VPS (ou VPS dédié)
2. `standby.signal` + `primary_conninfo` pointant vers le primary
3. Streaming replication standard Postgres
4. Côté Next.js : `lib/db.ts` route les SELECT vers replica, INSERT/UPDATE vers primary

**Coût** : +0€ si même VPS (mais limite I/O et RAM). Sinon +10€/mois VPS dédié.

## Roadmap activation

| Étape | État | Quand |
|---|---|---|
| V1 sync horaire | ✅ code livré (V97.39.24) | Activer après Phase 2 cutover |
| V2 logical replication | ⏳ plan rédigé | Après Phase 6 stable 7j |
| V3 bidirectional | 🟡 optionnel | Si dual-write rallonge nécessaire |
| V4 read replicas | 🟡 optionnel | Si scale >100 RPS |

## Métriques à surveiller

Après activation V2 :
```sql
-- Lag de réplication (depuis le subscriber côté VPS)
SELECT subname, received_lsn, latest_end_lsn,
       latest_end_time - received_lsn::timestamptz AS lag
FROM pg_subscription_stat
JOIN pg_subscription USING (subid);

-- Latency par table (depuis le publisher côté Supabase)
SELECT pid, application_name, state, sync_state,
       pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS replay_lag
FROM pg_stat_replication;
```

## Activation V1 (à faire après cutover Phase 2)

```bash
ssh -i $HOME/.ssh/keymatch_vps ubuntu@149.202.60.152
cd /opt/keymatch/NextImmo-main/tools/postgres-vps
sudo cp systemd/keymatch-shadow-sync.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now keymatch-shadow-sync.timer
# Vérifie next run :
systemctl list-timers keymatch-shadow-sync.timer
# Test manuel :
sudo systemctl start keymatch-shadow-sync.service
tail -f /var/log/keymatch-shadow-sync.log
```
