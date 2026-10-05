export function ConverterGuide() {
  return (
    <div className="converter-guide">
      <section aria-labelledby="how-it-works-title">
        <p className="eyebrow">From REST index to API reference</p>
        <h2 id="how-it-works-title">How to convert a WordPress API to OpenAPI</h2>
        <p>
          WordPress exposes its public REST API routes in an index, usually at{' '}
          <code>/wp-json</code>. wp2oas turns that index into an OpenAPI specification
          describing the endpoints, HTTP methods, parameters, and request bodies.
        </p>
        <ol className="conversion-steps">
          <li>
            <h3>Add your WordPress REST index</h3>
            <p>
              Enter a site URL such as <code>https://example.com</code> or its{' '}
              <code>/wp-json</code> endpoint. You can also upload a downloaded JSON
              file or paste the REST index. Subdirectory installations and{' '}
              <code>/?rest_route=/</code> URLs are supported.
            </p>
          </li>
          <li>
            <h3>Explore the generated Swagger documentation</h3>
            <p>
              Browse routes grouped by WordPress namespace. Inspect query and path
              parameters, request body schemas, and supported HTTP methods. Search
              endpoints by path, method, operation, or namespace.
            </p>
          </li>
          <li>
            <h3>Download your OpenAPI specification</h3>
            <p>
              Export an OpenAPI 3.0.3 document as JSON or YAML for use with compatible
              API tools. URL conversions also provide a share link that reopens the
              public API reference.
            </p>
          </li>
        </ol>
      </section>

      <section className="converter-faq" aria-labelledby="faq-title">
        <h2 id="faq-title">WordPress to OpenAPI: common questions</h2>
        <details>
          <summary>Is wp2oas free, and does it upload my data?</summary>
          <p>
            wp2oas is free and converts your input locally in the browser. Uploaded
            files and pasted JSON stay in memory. URL mode requests the public REST
            index directly from the WordPress site. Share links contain the public
            source URL so the index can be fetched again.
          </p>
        </details>
        <details>
          <summary>What is the difference between OpenAPI and Swagger?</summary>
          <p>
            OpenAPI is the specification format that describes an HTTP API. Swagger UI
            is the interactive documentation viewer used here to display the generated
            OpenAPI document. wp2oas exports OpenAPI 3.0.3, rather than the older
            Swagger 2.0 format.
          </p>
        </details>
        <details>
          <summary>Why does fetching a WordPress URL sometimes fail?</summary>
          <p>
            The target site must allow cross-origin requests from this application.
            CORS restrictions, connectivity, TLS errors, or site blocking can prevent
            a fetch. If the request fails, download the WordPress REST index from{' '}
            <code>/wp-json</code> and use Upload JSON or Paste JSON instead.
          </p>
        </details>
        <details>
          <summary>Does the document include plugin routes and response schemas?</summary>
          <p>
            Public plugin routes can be converted when they appear in the WordPress
            REST index. Unsupported route patterns produce conversion warnings.
            WordPress generally does not provide response schemas in the index, so
            wp2oas adds basic success responses without inventing their structure.
            Private endpoints and authentication credentials are unsupported.
          </p>
        </details>
        <p className="guide-resources">
          Learn more in the{' '}
          <a href="https://developer.wordpress.org/rest-api/">WordPress REST API handbook</a>
          {' '}and the{' '}
          <a href="https://spec.openapis.org/oas/v3.0.3">OpenAPI 3.0.3 specification</a>.
        </p>
      </section>
    </div>
  )
}
