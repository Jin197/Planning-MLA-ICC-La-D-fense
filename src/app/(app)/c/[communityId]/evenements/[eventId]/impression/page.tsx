import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventDetail } from "@/server/services/events";
import { formatDateLong, formatRange, formatTime } from "@/lib/time";
import { ASSIGNMENT_LABELS } from "@/domain/assignments";
import { BRAND } from "@/lib/brand";
import { Alerte } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Version imprimable" };

/**
 * Version imprimable du planning d'un evenement : sobre, sans navigation,
 * sans couleur necessaire a la comprehension. Les motifs prives n'y figurent
 * pas.
 */
export default async function PageImpression({
  params,
}: {
  params: Promise<{ communityId: string; eventId: string }>;
}) {
  const { communityId, eventId } = await params;
  const detail = await getEventDetail(communityId, eventId);
  if (!detail.ok) {
    if (detail.code === "evenement_inconnu") notFound();
    return <Alerte ton="attention">{detail.message}</Alerte>;
  }
  const vue = detail.value;

  return (
    <article className="mx-auto max-w-3xl space-y-6 bg-white p-2 print:p-0">
      <header className="border-b border-bordure pb-4">
        <p className="text-xs uppercase tracking-wide text-nuit-doux">
          {BRAND.name} - {BRAND.context}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{vue.event.title}</h1>
        <p className="mt-1 text-sm text-nuit-doux">
          {vue.sessions[0]
            ? formatDateLong(vue.sessions[0].session.startsAt, vue.event.timezone)
            : "Sans date"}{" "}
          - etat : {vue.event.state}
          {vue.event.publishedVersion > 0
            ? ` - version publiee ${vue.event.publishedVersion}`
            : ""}
        </p>
        {vue.event.description ? (
          <p className="mt-2 text-sm">{vue.event.description}</p>
        ) : null}
      </header>

      {!vue.canSeePlan ? (
        <Alerte ton="info" titre="Plan non publie">
          Les affectations ne sont pas encore visibles pour votre role.
        </Alerte>
      ) : null}

      {vue.sessions.map(({ session, plans, setlist }) => (
        <section key={session.id} className="space-y-3">
          <h2 className="text-lg font-semibold">
            {session.label}
            <span className="ml-2 text-sm font-normal text-nuit-doux">
              {session.scheduleProvisional
                ? "horaire a definir"
                : formatRange(session.startsAt, session.endsAt, vue.event.timezone)}
            </span>
          </h2>
          {session.locationName ? (
            <p className="text-sm text-nuit-doux">
              {session.locationName}
              {session.locationAddress ? ` - ${session.locationAddress}` : ""}
            </p>
          ) : null}

          {plans.map((plan) => (
            <table key={plan.id} className="w-full border-collapse text-sm">
              <caption className="pb-1 text-left font-medium">
                {plan.teamName}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-1/3 border border-bordure px-2 py-1 text-left"
                  >
                    Poste
                  </th>
                  <th scope="col" className="border border-bordure px-2 py-1 text-left">
                    Personnes
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.slots
                  .filter((slot) => slot.enabled)
                  .map((slot) => (
                    <tr key={slot.id}>
                      <th
                        scope="row"
                        className="border border-bordure px-2 py-1 text-left font-normal"
                      >
                        {slot.label}
                      </th>
                      <td className="border border-bordure px-2 py-1">
                        {slot.assignments.length === 0
                          ? slot.minRequired === 0
                            ? "-"
                            : "A completer"
                          : slot.assignments
                              .map(
                                (a) =>
                                  `${a.name}${a.detail ? ` (${a.detail})` : ""} [${ASSIGNMENT_LABELS[a.state]}]`,
                              )
                              .join(", ")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ))}

          {setlist.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Chants</h3>
              <ol className="mt-1 list-inside list-decimal text-sm">
                {setlist.map((item) => (
                  <li key={item.id}>
                    {item.sequence} : {item.freeTitle ?? "voir repertoire"}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ))}

      {vue.rehearsals.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold">Repetitions</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {vue.rehearsals.map((repetition) => (
              <li key={repetition.id}>
                {repetition.label} :{" "}
                {formatDateLong(repetition.startsAt, vue.event.timezone)}{" "}
                {formatTime(repetition.startsAt, vue.event.timezone)} -{" "}
                {formatTime(repetition.endsAt, vue.event.timezone)}
                {repetition.locationName ? ` - ${repetition.locationName}` : ""}
                {repetition.room ? ` (${repetition.room})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {vue.dressCodes.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold">Dress-code</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {vue.dressCodes.map((consigne) => (
              <li key={consigne.id}>
                <strong className="font-medium">
                  {consigne.teamId
                    ? (vue.teams.find((t) => t.id === consigne.teamId)?.name ??
                      "Equipe")
                    : "Commun"}{" "}
                  :
                </strong>{" "}
                {consigne.theme}
                {consigne.colors.length > 0
                  ? ` - couleurs : ${consigne.colors.join(", ")}`
                  : ""}
                {consigne.instruction ? ` - ${consigne.instruction}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="border-t border-bordure pt-3 text-xs text-nuit-doux">
        <p>
          Document genere par {BRAND.name}. Les motifs d&apos;indisponibilite
          restent prives et ne figurent pas dans cet export.
        </p>
      </footer>
    </article>
  );
}
