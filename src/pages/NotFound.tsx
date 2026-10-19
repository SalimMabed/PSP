import { LinkButton } from "@/components/ui/Button";
import { Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useDocumentTitle } from "@/hooks/useData";

export function NotFound() {
  useDocumentTitle("Page introuvable");
  return (
    <Section>
      <EmptyState
        icon="search"
        title="Cette page n'existe pas"
        action={
          <>
            <LinkButton to="/" variant="primary" icon="home">
              Tableau de bord
            </LinkButton>
            <LinkButton to="/transactions">Transactions</LinkButton>
          </>
        }
      >
        L'adresse saisie ne correspond à aucune page de la sandbox.
      </EmptyState>
    </Section>
  );
}
