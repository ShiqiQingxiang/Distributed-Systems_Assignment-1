## Serverless REST Assignment - Distributed Systems.

__Name:__ Qingxiang Shiqi
__Demo:__ https://youtu.be/zOl3yAh2E-A

### Context.

This API is used for managing movie information. The DynamoDB table items have the following attributes:

+ category - string (Partition key)
+ id - string (Sort Key)
+ title - string
+ director - string
+ year - number
+ rating - number
+ description - string
+ isAvailable - boolean
+ translations - Map<string, string> (Cache for translated content)

### App API endpoints.

+ GET /movies - Get all movies
+ GET /movies?category={category} - Get movies by category
+ GET /movies?id={id} - Get specific movie details
+ GET /movies/{category}/{id}/translation?language={language} - Get translation of movie description
+ POST /movies - Add a new movie (requires API key)
+ PUT /movies/{category}/{id} - Update movie information (requires API key)

### Features.

#### Translation persistence

The solution implements translation persistence by storing translations in the movie item itself. When a translation is requested, the system first checks if the translation already exists in the cache. If found, it returns the cached translation; otherwise, it calls AWS Translate service to perform the translation, then stores the result in the movie's translations map for future use.

Movie item structure with translations:
```
{
  "category": "action",
  "id": "movie1",
  "title": "The Matrix",
  "director": "The Wachowskis",
  "year": 1999,
  "rating": 8.7,
  "description": "A computer hacker learns about the true nature of reality and joins a rebellion against machines.",
  "isAvailable": true,
  "translations": {
    "en": "A computer hacker learns about the true nature of reality and joins a rebellion against machines.",
    "de": "Ein Computerhacker erfährt die wahre Natur der Realität und schließt sich einer Rebellion gegen Maschinen an.",
    "fr": "Un pirate informatique découvre la vraie nature de la réalité et rejoint une rébellion contre les machines."
  }
}
```

#### API Keys.

The API implements API key authentication to protect sensitive endpoints that modify data. Only requests with valid API keys can add or modify movie data.

The implementation is done in the CDK stack:

```ts
// Create API key
const apiKey = api.addApiKey('MovieApiKey');

// Create usage plan
const plan = api.addUsagePlan('MovieApiUsagePlan', {
  name: 'Standard',
  description: 'Standard usage plan'
});

// Add API key to the usage plan
plan.addApiKey(apiKey);

// Add API stage to the usage plan
plan.addApiStage({
  stage: api.deploymentStage
});

// Endpoints requiring API key
moviesResource.addMethod('POST', moviesIntegration, {
  apiKeyRequired: true
});

movieResource.addMethod('PUT', moviesIntegration, {
  apiKeyRequired: true
});
```

### Technology Stack

- AWS CDK (TypeScript)
- AWS Lambda
- API Gateway
- DynamoDB
- AWS Translate

### Usage Instructions

To deploy the API:
```
npm run cdk deploy
```

After deployment, the console will display the API endpoint URL and API key ID.

