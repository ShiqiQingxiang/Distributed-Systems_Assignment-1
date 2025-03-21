import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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
    });

    // 授予Lambda函数对DynamoDB表的读写权限
    moviesTable.grantReadWriteData(moviesLambda);

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

    // 添加根资源路径（/movies）
    const moviesResource = api.root.addResource('movies');
    
    // 添加集成和方法
    const moviesIntegration = new apigateway.LambdaIntegration(moviesLambda);
    moviesResource.addMethod('GET', moviesIntegration);
    moviesResource.addMethod('POST', moviesIntegration);

    // 导出DynamoDB表名和API URL
    new cdk.CfnOutput(this, 'TableName', {
      value: moviesTable.tableName,
      description: 'DynamoDB表名',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API网关URL',
    });
  }
}
