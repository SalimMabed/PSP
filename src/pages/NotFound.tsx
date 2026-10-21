import { LinkButton } from "@/components/ui/Button";
import { Section } from "@/components/ui/Blocks";
import { EmptyState } from "@/components/ui/States";
import { useDocumentTitle } from "@/hooks/useData";

export function NotFound() {
  useDocumentTitle("Page not found");
  return (
    <Section>
      <EmptyState
        icon="search"
        title="This page does not exist"
        action={
          <>
            <LinkButton to="/" variant="primary" icon="home">
              Dashboard
            </LinkButton>
            <LinkButton to="/transactions">Transactions</LinkButton>
          </>
        }
      >
        The address you entered does not match any page of the sandbox.
      </EmptyState>
    </Section>
  );
}
