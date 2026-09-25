import * as cdk from "aws-cdk-lib";
import * as fs from "node:fs";
import * as path from "node:path";
import { aws_cloudfront as cloudfront, aws_ec2 as ec2, aws_ecr as ecr, aws_iam as iam, aws_logs as logs, aws_s3 as s3, aws_secretsmanager as secrets } from "aws-cdk-lib";
import { Construct } from "constructs";

export class CentralOsCloudStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 }
      ]
    });
    const appSg = new ec2.SecurityGroup(this, "AppSecurityGroup", { vpc, allowAllOutbound: true, description: "No public ingress; add only the CloudFront VPC Origin security group before deployment" });
    const cloudFrontOriginPrefixListId = new cdk.CfnParameter(this, "CloudFrontOriginPrefixListId", { type: "String", description: "AWS-managed CloudFront origin-facing prefix list ID for the selected region" });
    new ec2.CfnSecurityGroupIngress(this, "CloudFrontOriginIngress", { groupId: appSg.securityGroupId, ipProtocol: "tcp", fromPort: 8080, toPort: 8080, sourcePrefixListId: cloudFrontOriginPrefixListId.valueAsString, description: "CloudFront VPC Origin to reverse proxy only" });
    const instanceRole = new iam.Role(this, "InstanceRole", { assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"), managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")] });
    const instance = new ec2.Instance(this, "ApplicationInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: new ec2.InstanceType("t3a.large"),
      machineImage: ec2.MachineImage.fromSsmParameter("/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"),
      securityGroup: appSg,
      role: instanceRole,
      userData: ec2.UserData.custom(fs.readFileSync(path.join(__dirname, "../../bootstrap/user-data.sh"), "utf8")),
      blockDevices: [
        { deviceName: "/dev/xvda", volume: ec2.BlockDeviceVolume.ebs(30, { volumeType: ec2.EbsDeviceVolumeType.GP3, encrypted: true, deleteOnTermination: true }) },
        { deviceName: "/dev/xvdf", volume: ec2.BlockDeviceVolume.ebs(100, { volumeType: ec2.EbsDeviceVolumeType.GP3, encrypted: true, deleteOnTermination: false }) }
      ]
    });
    const vpcOrigin = new cdk.CfnResource(this, "VpcOrigin", {
      type: "AWS::CloudFront::VpcOrigin",
      properties: {
        VpcOriginEndpointConfig: {
          Name: "central-os-vpc-origin",
          Arn: cdk.Stack.of(this).formatArn({ service: "ec2", resource: "instance", resourceName: instance.instance.ref }),
          HTTPPort: 8080,
          HTTPSPort: 8443,
          OriginProtocolPolicy: "http-only"
        }
      }
    });

    const frontendBucket = new s3.Bucket(this, "FrontendBucket", { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED });
    const backupBucket = new s3.Bucket(this, "BackupBucket", { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, versioned: true, lifecycleRules: [{ expiration: cdk.Duration.days(365) }] });
    const frontendOac = new cloudfront.CfnOriginAccessControl(this, "FrontendOac", { originAccessControlConfig: { name: "central-os-frontend-oac", originAccessControlOriginType: "s3", signingBehavior: "always", signingProtocol: "sigv4" } });
    const spaFunction = new cloudfront.Function(this, "SpaRewriteFunction", { code: cloudfront.FunctionCode.fromFile({ filePath: "../cloudfront/spa-rewrite.js" }), runtime: cloudfront.FunctionRuntime.JS_2_0 });
    const distribution = new cloudfront.CfnDistribution(this, "Distribution", {
      distributionConfig: {
        enabled: true,
        defaultRootObject: "index.html",
        httpVersion: "http2",
        origins: [
          { id: "frontend-s3", domainName: frontendBucket.bucketRegionalDomainName, s3OriginConfig: { originAccessIdentity: "" }, originAccessControlId: frontendOac.ref },
          { id: "central-os-vpc-origin", domainName: instance.instancePrivateDnsName, customOriginConfig: { httpPort: 8080, httpsPort: 8443, originProtocolPolicy: "http-only", originSslProtocols: ["TLSv1.2"] }, vpcOriginConfig: { vpcOriginId: vpcOrigin.ref } }
        ],
        defaultCacheBehavior: { targetOriginId: "frontend-s3", viewerProtocolPolicy: "redirect-to-https", minTtl: 0, defaultTtl: 60, maxTtl: 300, forwardedValues: { queryString: true, cookies: { forward: "none" } }, functionAssociations: [{ eventType: "viewer-request", functionArn: spaFunction.functionArn }] },
        cacheBehaviors: [{ pathPattern: "/api/*", targetOriginId: "central-os-vpc-origin", viewerProtocolPolicy: "redirect-to-https", minTtl: 0, defaultTtl: 0, maxTtl: 0, allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"], cachedMethods: ["GET", "HEAD"], forwardedValues: { queryString: true, headers: ["Authorization", "Origin", "Content-Type"], cookies: { forward: "all" } } }],
        viewerCertificate: { cloudFrontDefaultCertificate: true }
      }
    });
    const frontendBucketPolicy = new s3.BucketPolicy(this, "FrontendBucketPolicy", { bucket: frontendBucket });
    frontendBucketPolicy.document.addStatements(new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
      resources: [frontendBucket.arnForObjects("*")],
      conditions: { StringEquals: { "AWS:SourceArn": cdk.Stack.of(this).formatArn({ service: "cloudfront", resource: "distribution", resourceName: distribution.ref }) } }
    }));
    frontendBucketPolicy.document.addStatements(new iam.PolicyStatement({
      sid: "DenyInsecureTransport",
      effect: iam.Effect.DENY,
      actions: ["s3:*"] ,
      principals: [new iam.AnyPrincipal()],
      resources: [frontendBucket.bucketArn, frontendBucket.arnForObjects("*")],
      conditions: { Bool: { "aws:SecureTransport": "false" } }
    }));

    const backendRepository = new ecr.Repository(this, "BackendRepository", { repositoryName: "central-os/backend", imageScanOnPush: true, imageTagMutability: ecr.TagMutability.IMMUTABLE });
    const relatorioRepository = new ecr.Repository(this, "RelatorioRepository", { repositoryName: "central-os/relatorio-os", imageScanOnPush: true, imageTagMutability: ecr.TagMutability.IMMUTABLE });
    const evolutionRepository = new ecr.Repository(this, "EvolutionRepository", { repositoryName: "central-os/evolution", imageScanOnPush: true, imageTagMutability: ecr.TagMutability.IMMUTABLE });
    instanceRole.addToPolicy(new iam.PolicyStatement({ actions: ["ecr:GetAuthorizationToken"], resources: ["*"] }));
    instanceRole.addToPolicy(new iam.PolicyStatement({ actions: ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"], resources: [backendRepository.repositoryArn, relatorioRepository.repositoryArn, evolutionRepository.repositoryArn] }));
    const databaseSecrets = new secrets.Secret(this, "DatabaseSecrets", { secretName: "/central-os/database", generateSecretString: { secretStringTemplate: "{}", generateStringKey: "bootstrap", excludePunctuation: true } });
    const evolutionSecrets = new secrets.Secret(this, "EvolutionSecrets", { secretName: "/central-os/evolution", generateSecretString: { secretStringTemplate: "{}", generateStringKey: "bootstrap", excludePunctuation: true } });
    const authSecrets = new secrets.Secret(this, "AuthSecrets", { secretName: "/central-os/auth", generateSecretString: { secretStringTemplate: "{}", generateStringKey: "bootstrap", excludePunctuation: true } });
    instanceRole.addToPolicy(new iam.PolicyStatement({ actions: ["secretsmanager:GetSecretValue"], resources: [databaseSecrets.secretArn, evolutionSecrets.secretArn, authSecrets.secretArn] }));
    instanceRole.addToPolicy(new iam.PolicyStatement({ actions: ["s3:ListBucket"], resources: [backupBucket.bucketArn] }));
    instanceRole.addToPolicy(new iam.PolicyStatement({ actions: ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"], resources: [backupBucket.arnForObjects("backups/*")] }));
    instanceRole.addToPolicy(new iam.PolicyStatement({ actions: ["logs:CreateLogStream", "logs:PutLogEvents"], resources: ["*"] }));
    for (const [id, name] of [["BackendLogs", "/central-os/backend"], ["WorkerLogs", "/central-os/worker"], ["ListenerLogs", "/central-os/listener"], ["EvolutionLogs", "/central-os/evolution"] as const]) {
      new logs.LogGroup(this, id, { logGroupName: name, retention: logs.RetentionDays.ONE_MONTH, removalPolicy: cdk.RemovalPolicy.RETAIN });
    }
  }
}
