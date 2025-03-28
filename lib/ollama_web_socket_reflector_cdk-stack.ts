import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import {AttributeType, Table, BillingMode, ProjectionType} from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class OllamaWebSocketReflectorCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    /** Lambda code */
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM Role for Lambda function',
    });

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["execute-api:*"],
        resources: ["*"]
      })
    )

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:*"],
        resources: ["*"]
      })
    )

    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );


    const wsHandler = new lambda.Function(this, 'WebSocketHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaRole
    });

    /** APIGW */
    const wsApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      connectRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('ConnectIntegration', wsHandler) },
      disconnectRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('DisconnectIntegration', wsHandler) },
      defaultRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('DefaultIntegration', wsHandler) }
    });

    const wsStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: wsApi,
      stageName: 'dev',
      autoDeploy: true,
    });

    /** DDB Table */
    const table = new Table(this, 'ConnectionsTable', {
      tableName: 'ConnectionsTable',
      partitionKey: { name: 'connection_id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    table.addGlobalSecondaryIndex({
      indexName: 'ConnectionTypeIndex',
      partitionKey: { name: 'connection_type', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });


    new cdk.CfnOutput(this, 'WebSocketAPIURL', {
      value: `wscat -c wss://${wsApi.apiId}.execute-api.us-west-2.amazonaws.com/dev`,
    });
  }
}