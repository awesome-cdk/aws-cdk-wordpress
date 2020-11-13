import {Construct, Duration, RemovalPolicy, Stack, StackProps} from "@aws-cdk/core";
import * as ecs from "@aws-cdk/aws-ecs";
import {
    Cluster,
    Ec2Service,
    Ec2TaskDefinition,
    LogDriver,
    NetworkMode,
    PlacementStrategy,
    Secret
} from "@aws-cdk/aws-ecs";
import * as path from "path";
import {FileSystem} from "@aws-cdk/aws-efs";
import {InstanceClass, InstanceSize, InstanceType, Port, SecurityGroup, SubnetType, Vpc} from "@aws-cdk/aws-ec2";
import {DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion} from "@aws-cdk/aws-rds";
import {ApplicationLoadBalancer, ApplicationProtocol, Protocol} from "@aws-cdk/aws-elasticloadbalancingv2";
import {RetentionDays} from "@aws-cdk/aws-logs";

interface Props extends StackProps {
    cluster: Cluster,
    fileSystem: FileSystem,
    fileSystemSecurityGroup: SecurityGroup,
    loadBalancer: ApplicationLoadBalancer,
}

export class ServerlessWordpressApp extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const rds = this.getRds();

        const volumeNames = {
            wpContent: 'wp-content',
        }

        const taskDefinition = new Ec2TaskDefinition(this, 'Ec2TaskDefinition', {
            networkMode: NetworkMode.AWS_VPC,
            family: "wordpress",
        });

        const containerWordpress = taskDefinition.addContainer('wordpress', {
            memoryLimitMiB: 126,
            image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, './../wordpress')),
            privileged: true,
            secrets: {
                WORDPRESS_DB_HOST: Secret.fromSecretsManager(rds.secret!, 'host'),
                WORDPRESS_DB_USER: Secret.fromSecretsManager(rds.secret!, 'username'),
                WORDPRESS_DB_PASSWORD: Secret.fromSecretsManager(rds.secret!, 'password'),
            },
            environment: {
                // DB will be auto created if not existing
                WORDPRESS_DB_NAME: 'wordpress',
                WORDPRESS_TABLE_PREFIX: 'wp1_',
                WORDPRESS_DEBUG: '1',
            },
            logging: LogDriver.awsLogs({
                streamPrefix: 'wordpress',
                logRetention: RetentionDays.ONE_WEEK,
            }),
        });
        containerWordpress.addPortMappings({
            containerPort: 80,
        });

        taskDefinition.addVolume({
            name: volumeNames.wpContent,
            host: {
                // Path relative to EC2 instance that holds the container
                sourcePath: "/mnt/efs/fs1/wp-content",
            },
        });
        containerWordpress.addMountPoints({
            readOnly: false,
            // Path inside container
            containerPath: '/var/www/html/wp-content',
            // Name of volume, previously declared by calling TaskDefinition.addVolume()
            sourceVolume: volumeNames.wpContent,
        });

        const service = new Ec2Service(this, 'WordPress', {
            cluster: props.cluster,
            taskDefinition,
            desiredCount: 2,
            minHealthyPercent: 0,
            securityGroups: [
                // Allow the container to communicate with EFS volume
                props.fileSystemSecurityGroup,
            ],
        });
        service.addPlacementStrategies(
            PlacementStrategy.spreadAcrossInstances(),
            PlacementStrategy.randomly()
        );

        // Allow the ECS container to communicate with RDS
        rds.connections.allowDefaultPortFrom(service);

        // Add a listener and open up the load balancer's security group
        // to the world.
        const listener = props.loadBalancer.addListener('HTTPListener', {
            port: 80,

            // 'open: true' is the default, you can leave it out if you want. Set it
            // to 'false' and use `listener.connections` if you want to be selective
            // about who can access the load balancer.
            open: true,
        });
        listener.addTargets('wordpressTarget', {
            healthCheck: {
                healthyHttpCodes: "200,302",
                protocol: Protocol.HTTP,
                port: "80",
                unhealthyThresholdCount: 3,
                interval: Duration.seconds(15),
            },
            targets: [service],
            port: 80,
            protocol: ApplicationProtocol.HTTP,
            deregistrationDelay: Duration.seconds(10),
        });

        service.connections.allowFromAnyIpv4(Port.allTraffic());
    }

    private getRds() {
        const vpc = Vpc.fromLookup(this, 'vpc', {
            isDefault: true,
        });
        return new DatabaseInstance(this, 'Instance', {
            removalPolicy: RemovalPolicy.DESTROY,
            deleteAutomatedBackups: true,
            deletionProtection: false,
            engine: DatabaseInstanceEngine.mysql({version: MysqlEngineVersion.VER_5_7_31}),
            // optional, defaults to m5.large
            instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.SMALL),
            vpc,
            vpcSubnets: {
                subnetType: SubnetType.PUBLIC
            },
        });
    }
}