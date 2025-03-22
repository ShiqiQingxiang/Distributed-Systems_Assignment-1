# Distributed Systems - Assignment 1

This project implements a REST API based on AWS serverless architecture, using CDK framework to configure and deploy required resources.

Demo video's link: https://youtu.be/zOl3yAh2E-A

## Project Context

This API is used for managing movie information, providing the following features:
- Add new movies
- Retrieve movie list
- Filter movies by category
- Update movie information
- Get multilingual translations of movie descriptions

## Technology Stack

- AWS CDK (TypeScript)
- AWS Lambda
- API Gateway
- DynamoDB
- AWS Translate

## API Endpoints

API provides the following main endpoints:

- `GET /movies` - Get all movies
- `GET /movies?category={category}` - Get movies by category
- `GET /movies?id={id}` - Get specific movie details
- `GET /movies/{category}/{id}/translation?language={language}` - Get translation of movie description
- `POST /movies` - Add a new movie (requires API key)
- `PUT /movies/{category}/{id}` - Update movie information (requires API key)

## Feature Implementation

### Movie Data Management
- Movie data is stored in DynamoDB table, containing title, director, year, rating, description, translation cache content, etc.
- Data is organized using partition key (category) and sort key (id)
- Supports filtering by category and querying specific movies

### Translation Functionality
- Uses AWS Translate service for real-time translation of movie descriptions
- Supports multiple languages, including English (en), French (fr), German (de), Spanish (es), Japanese (ja), etc.
- Implements translation result caching to avoid repeated translation requests

### Security and Authorization
- API key protection for sensitive endpoints
- Only requests with valid API keys can add or modify movie data

## Usage Instructions

### Deploying the API
```
npm run cdk deploy
```

After deployment, the console will display the API endpoint URL and API key ID.

