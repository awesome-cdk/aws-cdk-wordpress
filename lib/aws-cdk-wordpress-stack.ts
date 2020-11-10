import * as cdk from '@aws-cdk/core';
import {RemovalPolicy} from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
import {Ec2Service, Ec2TaskDefinition, NetworkMode} from '@aws-cdk/aws-ecs';
import {InstanceType, Port, SecurityGroup, Vpc} from "@aws-cdk/aws-ec2";
import {FileSystem, LifecyclePolicy, PerformanceMode, ThroughputMode} from "@aws-cdk/aws-efs";
import * as path from "path";
import {ApplicationLoadBalancer} from "@aws-cdk/aws-elasticloadbalancingv2";

export class AwsCdkWordpressStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = Vpc.fromLookup(this, 'vpc', {
            isDefault: true,
        })

        const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
            allowAllOutbound: true,
            vpc,
        });
        securityGroup.addIngressRule(securityGroup, Port.allTraffic());
        // @TODO Restrict access when the whole thing is working
        securityGroup.connections.allowFromAnyIpv4(Port.allTraffic());
        securityGroup.connections.allowToAnyIpv4(Port.allTraffic());

        // Create an ECS cluster
        const cluster = new ecs.Cluster(this, 'Cluster', {
            vpc,
        });
        const spotFleet = cluster.addCapacity('AsgSpot', {
            maxCapacity: 10,
            minCapacity: 5,
            instanceType: new InstanceType('t3a.nano'),
            spotPrice: '0.0046',
            spotInstanceDraining: true,
        });
        spotFleet.addSecurityGroup(securityGroup);
        spotFleet.connections.allowFromAnyIpv4(Port.allTraffic());
        spotFleet.connections.allowToAnyIpv4(Port.allTraffic());

        const volumeName = 'wp-volume';

        const fileSystem = new FileSystem(this, 'MyEfsFileSystem', {
            vpc,
            encrypted: true,
            lifecyclePolicy: LifecyclePolicy.AFTER_7_DAYS,
            performanceMode: PerformanceMode.GENERAL_PURPOSE,
            throughputMode: ThroughputMode.BURSTING,
            removalPolicy: RemovalPolicy.DESTROY,
        });
        const accessPoint = fileSystem.addAccessPoint('AccessPoint', {
            createAcl: {
                ownerUid: '1001',
                ownerGid: '1001',
                permissions: '750',
            },
            // enforce the POSIX identity so container will access with this identity
            posixUser: {
                uid: '1001',
                gid: '1001',
            },
        });

        fileSystem.connections.allowFromAnyIpv4(Port.allTraffic());

        const taskDefinition = new Ec2TaskDefinition(this, 'Ec2TaskDefinition', {
            networkMode: NetworkMode.AWS_VPC,
            family: "wordpress",
        });
        taskDefinition.addVolume({
            name: volumeName,
            efsVolumeConfiguration: {
                fileSystemId: fileSystem.fileSystemId,
                transitEncryption: "ENABLED",
                authorizationConfig: {
                    accessPointId: accessPoint.accessPointId,
                    iam: "ENABLED",
                }
            },
        });
        const container = taskDefinition.addContainer('wordpress', {
            memoryLimitMiB: 256,
            image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, './wordpress')),
        });
        container.addPortMappings({
            containerPort: 80,
        });

        container.addMountPoints({
            readOnly: false,
            containerPath: '/var/www/html/wp-content',
            sourceVolume: volumeName,
        });

        const service = new Ec2Service(this, 'WordPress', {
            cluster,
            taskDefinition,
            desiredCount: 2,
            minHealthyPercent: 0,
            securityGroups: [
                securityGroup,
            ]
        });

        // Create the load balancer in a VPC. 'internetFacing' is 'false'
        // by default, which creates an internal load balancer.
        const lb = new ApplicationLoadBalancer(this, 'LB', {
            vpc,
            internetFacing: true
        });

        // Add a listener and open up the load balancer's security group
        // to the world.
        const listener = lb.addListener('Listener', {
            port: 80,

            // 'open: true' is the default, you can leave it out if you want. Set it
            // to 'false' and use `listener.connections` if you want to be selective
            // about who can access the load balancer.
            open: true,
        });

        listener.addTargets('ApplicationFleet', {
            port: 80,
            targets: [service],
        });

    }
}
