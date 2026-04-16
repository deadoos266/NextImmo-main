# Rotation des secrets — URGENT

**Contexte** : des secrets ont ete exposes dans le fichier versionne `CLAUDE_CODE_CONTEXT.md` (notamment `NEXTAUTH_SECRET=nestmatch_super_secret_2024` et l'URL Supabase). Le repo etant pousse sur GitHub (`deadoos266/NextImmo-main`), il faut considerer ces secrets comme compromis et tous les roter.

Le `.env.local` lui-meme n'est pas versionne (il est dans `.gitignore`) mais le `NEXTAUTH_SECRET` etait dans le .md. Par precaution, on rote tout.

---

## 1. NEXTAUTH_SECRET (le plus urgent)

Ce secret protege toutes les sessions. S'il est connu, n'importe qui peut forger une session de n'importe quel utilisateur.

**Generer un nouveau secret** :
- Windows PowerShell : `[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))`
- Ou en ligne : https://generate-secret.vercel.app/32

**Mettre a jour** :
1. Dans `.env.local` local : remplacer la valeur de `NEXTAUTH_SECRET`
2. Dans Vercel : Dashboard > ton projet > Settings > Environment Variables > modifier `NEXTAUTH_SECRET` > Redeploy

**Consequence** : tous les utilisateurs actuellement connectes seront deconnectes. Ils devront se reconnecter. C'est normal et attendu.

---

## 2. GOOGLE_CLIENT_SECRET

Permet a un attaquant d'usurper le flow OAuth Google.

1. Aller sur https://console.cloud.google.com/apis/credentials
2. Selectionner le projet NestMatch
3. Ouvrir le client OAuth 2.0 (ID : 428990672925-p5q0jgttfqn1kb4el3lbdrr4i2d7ae6t...)
4. Cliquer sur "Add secret" pour generer un nouveau secret
5. Copier la nouvelle valeur
6. Mettre a jour `.env.local` + Vercel (`GOOGLE_CLIENT_SECRET`)
7. Apres verification que tout fonctionne, supprimer l'ancien secret (bouton corbeille)

---

## 3. SUPABASE_SERVICE_ROLE_KEY

**Critique** : cette cle contourne toute la securite Supabase (RLS). Si exposee, un attaquant a acces total a la base.

1. Aller sur https://supabase.com/dashboard/project/wzzibgdupycysvtwsqxo/settings/api
2. Section "Project API keys"
3. Cliquer "Reset" a cote de `service_role`
4. Confirmer
5. Copier la nouvelle valeur
6. Mettre a jour `.env.local` + Vercel

Note : la cle `anon` publique peut rester telle quelle (elle est concue pour etre exposee cote client, c'est la RLS qui la protege). Si tu prefers la roter aussi, meme procedure.

---

## 4. ANTHROPIC_API_KEY

L'endpoint `/api/agent` est actuellement public sans auth — si ta cle Anthropic fuit, n'importe qui peut te couter de l'argent.

1. Aller sur https://console.anthropic.com/settings/keys
2. Revoquer la cle actuelle (celle qui commence par `sk-ant-api03-2iQE8KCdW...`)
3. Creer une nouvelle cle
4. Mettre a jour `.env.local` + Vercel
5. **Important** : on va aussi proteger `/api/agent` avec auth et rate-limit dans l'etape suivante (voir plus bas)

---

## 5. Sur Vercel — ordre recommande

Pour eviter une minute d'indisponibilite :

1. Ajouter les NOUVELLES valeurs dans Vercel (sans supprimer les anciennes, juste creer de nouvelles entrees si possible, sinon ecraser)
2. Redeployer (bouton "Redeploy" ou `vercel --prod`)
3. Tester que l'app fonctionne (login, annonces)
4. Seulement apres : revoquer les anciennes valeurs chez Google / Supabase / Anthropic

---

## 6. Apres rotation — nettoyer l'historique git

Meme si tu nettoies les fichiers maintenant, les anciennes valeurs restent dans l'historique git et sont visibles sur GitHub.

Options :

**A. Rendre le repo prive** (le plus simple si pas encore fait) :
GitHub > Settings > Danger Zone > Change visibility > Private

**B. Purger l'historique** (si repo public absolument necessaire) :
Utiliser `git filter-repo` ou BFG Repo-Cleaner. Procedure plus technique — ouvrir une session dediee avec Claude pour ca.

**C. Accepter le risque** apres rotation :
Une fois les secrets rotes, les valeurs dans l'historique ne fonctionnent plus. Risque residuel : elles restent visibles comme "exemples de ce qu'il ne faut pas faire".

Recommandation : **A + rotation** (minimum). **A + B + rotation** (ideal).

---

## Checklist

- [ ] `NEXTAUTH_SECRET` regenere et pousse sur Vercel
- [ ] `GOOGLE_CLIENT_SECRET` regenere et pousse sur Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` regeneree et poussee sur Vercel
- [ ] `ANTHROPIC_API_KEY` regeneree et poussee sur Vercel
- [ ] Repo GitHub passe en prive OU historique purge
- [ ] App re-deployee et testee (login OK, liste annonces OK)
- [ ] Ancien `NEXTAUTH_SECRET` revoque (deconnexion forcee de tous les users — attendu)
