export type PublishIssue = {
  message: string;
  actionLabel?: string;
  actionHref?: string;
  rawTechnical?: string;
};

export function resolvePublishIssue(rawError?: string | null): PublishIssue | null {
  if (!rawError) {
    return null;
  }

  if (rawError.includes('[oauth-scope-missing]')) {
    return {
      message: 'Brakuje wymaganych zgód do publikacji. Odśwież połączenie konta i zaakceptuj wszystkie uprawnienia.',
      actionLabel: 'Przejdź do połączeń',
      actionHref: '/social-accounts',
      rawTechnical: rawError,
    };
  }

  if (
    rawError.includes('unaudited_client_can_only_post_to_private_accounts') ||
    rawError.toLowerCase().includes('private_accounts')
  ) {
    return {
      message: 'Integracja TikTok działa w trybie ograniczonym i pozwala publikować tylko na wybrane konta.',
      actionLabel: 'Sprawdź konfigurację TikTok',
      actionHref: '/social-accounts',
      rawTechnical: rawError,
    };
  }

  if (
    rawError.toLowerCase().includes('token invalid') ||
    rawError.toLowerCase().includes('token expired') ||
    rawError.toLowerCase().includes('invalid/expired')
  ) {
    return {
      message: 'Sesja połączenia wygasła. Połącz konto ponownie, aby wznowić publikację.',
      actionLabel: 'Odśwież połączenie',
      actionHref: '/social-accounts',
      rawTechnical: rawError,
    };
  }

  if (rawError.includes('[retry-attempt:')) {
    return {
      message: 'System ponawia próbę publikacji automatycznie. Sprawdź status za chwilę.',
      rawTechnical: rawError,
    };
  }

  return {
    message: 'Wystąpił błąd publikacji. Otwórz szczegóły techniczne, aby zobaczyć pełny log.',
    rawTechnical: rawError,
  };
}
