import {Construct, RemovalPolicy, Stack, StackProps} from "@aws-cdk/core";
import {FileSystem, LifecyclePolicy, PerformanceMode, ThroughputMode} from "@aws-cdk/aws-efs";
import {Port, SecurityGroup, Vpc} from "@aws-cdk/aws-ec2";

export class ElasticFileSystem extends Stack {

    public fileSystem: FileSystem;

    /**
     * This security group is given ingress access to the EFS
     * Attach it to any EC2 instances that need to mount the EFS
     */
    public securityGroup: SecurityGroup;

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const vpc = Vpc.fromLookup(this, 'vpc', {
            isDefault: true,
        })

        this.fileSystem = new FileSystem(this, 'MyEfsFileSystem', {
            vpc,
            encrypted: true,
            lifecyclePolicy: LifecyclePolicy.AFTER_7_DAYS,
            performanceMode: PerformanceMode.GENERAL_PURPOSE,
            throughputMode: ThroughputMode.BURSTING,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.securityGroup = new SecurityGroup(this, 'SecurityGroup', {
            vpc,
        });

        this.fileSystem.connections.allowDefaultPortFrom(this.securityGroup);
        this.fileSystem.connections.allowToAnyIpv4(Port.allTraffic());
    }
}