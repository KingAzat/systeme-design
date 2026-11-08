"use client";

/**
 * SystemLab — Frontière d'erreur globale de la route « / ».
 *
 * Filet de sécurité anti « écran blanc » : une exception lancée dans un rendu
 * (données corrompues, format périmé…) démonte sinon tout l'arbre React sans
 * recours pour l'utilisateur. Ici : message français honnête + deux issues
 * (réessayer le rendu, recharger la page) — les données persistées côté
 * serveur ne sont jamais en cause.
 */
import { useEffect } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SystemLab — erreur de rendu capturée :", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background p-6 text-center text-foreground">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <FlaskConical className="size-6" aria-hidden />
      </span>
      <div className="max-w-md space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Une erreur inattendue est survenue
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Le laboratoire n&apos;a pas pu afficher cette vue. Vos architectures
          sauvegardées et votre progression sont intactes — réessayez, ou
          rechargez la page si le problème persiste.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Réessayer</Button>
        <Button
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          <RotateCcw aria-hidden />
          Recharger la page
        </Button>
      </div>
    </div>
  );
}
