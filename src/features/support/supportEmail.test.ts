import { buildSupportMailto } from '@/features/support/supportEmail';

function parse(mailto: string) {
  const [address, query] = mailto.replace('mailto:', '').split('?');
  const params = new URLSearchParams(query);
  return { address, subject: params.get('subject'), body: params.get('body') };
}

describe('buildSupportMailto', () => {
  it('addresses the official support inbox with the app name in the subject', () => {
    const { address, subject } = parse(buildSupportMailto('+919876543210'));
    expect(address).toBe('support@houseoftech.ai');
    expect(subject).toBe('Support Request – Astro108');
  });

  it("fills in the signed-in user's own number", () => {
    const { body } = parse(buildSupportMailto('+919876543210'));
    expect(body).toContain('My number is 9876543210.');
    expect(body).toMatch(/^Hi Support Team,/);
    expect(body).toMatch(/Thank you\.$/);
  });
});
