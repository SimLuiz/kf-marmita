export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordCheck {
  ok: boolean;
  errors: string[];
}

export function validatePassword(pwd: string): PasswordCheck {
  const errors: string[] = [];
  if (pwd.length < PASSWORD_MIN_LENGTH)
    errors.push(`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`);
  if (!/[A-Z]/.test(pwd)) errors.push("Pelo menos uma letra maiúscula");
  if (!/[a-z]/.test(pwd)) errors.push("Pelo menos uma letra minúscula");
  if (!/[0-9]/.test(pwd)) errors.push("Pelo menos um número");
  if (!/[^A-Za-z0-9]/.test(pwd)) errors.push("Pelo menos um símbolo");
  return { ok: errors.length === 0, errors };
}

export const PASSWORD_POLICY_HINT =
  "Mín. 12 caracteres, com maiúscula, minúscula, número e símbolo.";
