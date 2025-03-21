import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class ApiProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 创建DynamoDB表
    const moviesTable = new dynamodb.Table(this, 'MoviesTable', {
      partitionKey: { name: 'category', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 仅用于开发环境
    });

    // 创建Lambda函数
    const moviesLambda = new lambda.Function(this, 'MoviesFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'movies')),
      environment: {
        TABLE_NAME: moviesTable.tableName,
      },
      timeout: cdk.Duration.seconds(30), // 增加Lambda超时时间
      memorySize: 256, // 增加内存配置
    });

    // 授予Lambda函数对DynamoDB表的读写权限
    moviesTable.grantReadWriteData(moviesLambda);
    
    // 添加Lambda对Translate服务的访问权限
    moviesLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['translate:TranslateText'],
      resources: ['*'],
    }));

    // 创建API Gateway
    const api = new apigateway.RestApi(this, 'MoviesApi', {
      restApiName: 'Movies Service',
      description: 'This service manages movies information.',
      deployOptions: {
        stageName: 'dev',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // 创建API密钥
    const apiKey = api.addApiKey('MoviesApiKey', {
      apiKeyName: 'movies-api-key',
      description: 'API Key for Movies Service',
    });

    // 创建用量计划
    const plan = api.addUsagePlan('MoviesUsagePlan', {
      name: 'Movies Usage Plan',
      description: 'Usage plan for Movies API',
      throttle: {
        rateLimit: 10,
        burstLimit: 20
      },
      quota: {
        limit: 1000,
        period: apigateway.Period.DAY
      }
    });

    // 将API密钥添加到用量计划
    plan.addApiKey(apiKey);

    // 将API阶段添加到用量计划
    plan.addApiStage({
      stage: api.deploymentStage
    });

    // 添加根资源路径（/movies）
    const moviesResource = api.root.addResource('movies');
    
    // 添加集成
    const moviesIntegration = new apigateway.LambdaIntegration(moviesLambda);
    
    // GET请求不需要API密钥
    moviesResource.addMethod('GET', moviesIntegration);
    
    // POST请求需要API密钥
    moviesResource.addMethod('POST', moviesIntegration, {
      apiKeyRequired: true
    });
    
    // 添加电影类别和ID参数
    const movieResource = moviesResource.addResource('{category}').addResource('{id}');
    
    // PUT请求需要API密钥
    movieResource.addMethod('PUT', moviesIntegration, {
      apiKeyRequired: true
    });
    
    // 添加翻译资源
    const translationResource = movieResource.addResource('translation');
    translationResource.addMethod('GET', moviesIntegration);

    // 导出DynamoDB表名和API URL
    new cdk.CfnOutput(this, 'TableName', {
      value: moviesTable.tableName,
      description: 'DynamoDB表名',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API网关URL',
    });
    
    // 导出API密钥ID
    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API密钥ID',
    });
  }
}
