const fields = ['description', 'name', 'email', 'business', 'website', 'context'];

export function validateInquiry(details) {
  const errors = {};
  const description = String(details.description || '').trim();
  const name = String(details.name || '').trim();
  const email = String(details.email || '').trim();
  const business = String(details.business || '').trim();
  const website = String(details.website || '').trim();
  if (!description) errors.description = 'Tell us what you would like to improve.';
  else if (description.length > 3000) errors.description = 'Keep your description under 3,000 characters.';
  if (!name) errors.name = 'Enter your name.';
  else if (name.length > 120) errors.name = 'Keep your name under 120 characters.';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a complete email address.';
  if (business.length > 160) errors.business = 'Keep the business name under 160 characters.';
  if (website) {
    try {
      const url = new URL(website);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || website.length > 500) throw new Error('Invalid website');
    } catch {
      errors.website = 'Use a website address starting with https://, or leave it blank.';
    }
  }
  return errors;
}

export async function sendInquiry(details, submit = fetch) {
  const errors = validateInquiry(details);
  if (Object.keys(errors).length) throw new Error('Review the inquiry details before sending.');
  const body = new URLSearchParams({'form-name': 'studio-inquiry'});
  for (const field of fields) body.set(field, String(details[field] || '').trim());
  const response = await submit('/studio/', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: body.toString(),
  });
  if (!response.ok) throw new Error('The inquiry service did not accept your message.');
}
