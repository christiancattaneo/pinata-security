// XSS via dangerouslySetInnerHTML
// Expected: xss at line 8

import React from 'react';

interface Props { html: string; }

export function UnsafeComponent({ html }: Props) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;  // Line 8: VULNERABLE
}
