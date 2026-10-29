/** Le menu unique : options du parcours, parcours enregistrés, réglages, à propos. */
import { Minus, Plus, Trash2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatDistance, formatPace } from "@/lib/format/format";
import type { SavedRoute } from "@/lib/route/types";
import { Choice, IconButton, Sheet, Switch } from "./ui";

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {hint && <p className="text-sm text-mut">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ln py-3 first:border-t-0">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-y">{title}</h3>
      {children}
    </section>
  );
}

export function Menu({
  open,
  onClose,
  saved,
  onOpen,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  saved: SavedRoute[];
  onOpen: (r: SavedRoute) => void;
  onRemove: (id: string) => void;
}) {
  const [s, save] = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title="Menu">
      <Section title="Parcours">
        <div className="space-y-3 py-2">
          <Choice
            label="Forme"
            value={s.shape}
            onChange={(shape) => save({ shape })}
            options={[
              { value: "loop", label: "Boucle" },
              { value: "outback", label: "Aller-retour" },
            ]}
          />
          <Choice
            label="Terrain"
            value={s.kind}
            onChange={(kind) => save({ kind })}
            options={[
              { value: "road", label: "Route" },
              { value: "trail", label: "Trail" },
            ]}
          />
          {s.shape === "loop" && (
            <Choice
              label="Nombre de tours"
              value={s.laps}
              onChange={(laps) => save({ laps })}
              options={[1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? "1 tour" : `${n} tours` }))}
            />
          )}
        </div>
        <Row title="Idéal pour un record" hint="Plat, calme, le moins de routes à traverser ; propose le tour d'un étang ou d'un parc.">
          <Switch label="Idéal pour un record" checked={s.forRecord} onChange={(forRecord) => save({ forRecord })} />
        </Row>
      </Section>

      <Section title="Mes parcours">
        {saved.length === 0 ? (
          <p className="py-2 text-sm text-mut">Touche l'étoile d'un parcours pour le retrouver ici.</p>
        ) : (
          <ul>
            {saved.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 py-2.5 text-left" onClick={() => onOpen(r)}>
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block text-sm text-mut">
                    {formatDistance(r.stats.distanceM)} · {formatDate(r.createdAt)}
                  </span>
                </button>
                <IconButton label={`Supprimer ${r.name}`} className="size-10 bg-s2 shadow-none" onClick={() => onRemove(r.id)}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Réglages">
        <Row title="Mon allure" hint="Pour estimer la durée (avec le dénivelé).">
          <div className="flex items-center gap-2">
            <IconButton label="Allure plus rapide" className="size-9 bg-s2 shadow-none" onClick={() => save({ paceSecPerKm: s.paceSecPerKm - 5 })}>
              <Minus className="size-4" aria-hidden />
            </IconButton>
            <span className="w-20 text-center font-semibold tabular">{formatPace(s.paceSecPerKm)}</span>
            <IconButton label="Allure plus lente" className="size-9 bg-s2 shadow-none" onClick={() => save({ paceSecPerKm: s.paceSecPerKm + 5 })}>
              <Plus className="size-4" aria-hidden />
            </IconButton>
          </div>
        </Row>
        <Row title="Annonces vocales" hint="Pendant le guidage.">
          <Switch label="Annonces vocales" checked={s.voiceGuidance} onChange={(voiceGuidance) => save({ voiceGuidance })} />
        </Row>
      </Section>

      <Section title="À propos">
        <p className="py-2 text-sm text-mut">
          Parcours calculés sur ton téléphone, à partir des données ouvertes OpenStreetMap (© contributeurs OpenStreetMap, tuiles OpenFreeMap) et du relief
          Terrain Tiles (Mapzen). Aucun compte, aucune clé : ta position et tes parcours restent sur ton appareil.
        </p>
      </Section>
    </Sheet>
  );
}
