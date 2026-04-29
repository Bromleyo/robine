# TODO — Robin-v2

## Bugs bénins à corriger (non bloquants)

### P2002 upsert sur rejectedEmail lors de re-run d'import
**Fichier** : `src/lib/email/process-incoming.ts` → fonction `logRejectedEmail`
**Symptôme** : Quand on relance `import-info-history.ts --execute`, les emails déjà loggés dans `rejectedEmail`
lors d'un premier run génèrent une `UniqueConstraintViolation (P2002)` sur `microsoftGraphId`.
L'erreur est capturée silencieusement (log warning, pas de rethrow), le comportement final est correct
(l'email est bien compté comme rejected), mais ça pollue les logs et masque de vraies anomalies.
**Fix** : Remplacer le `create()` par un `upsert()` dans `logRejectedEmail` :
```ts
await prisma.rejectedEmail.upsert({
  where: { microsoftGraphId: data.microsoftGraphId },
  create: data,
  update: {},  // no-op si déjà présent
})
```
**Priorité** : Basse — n'affecte pas la correction des données, seulement la propreté des logs.
