/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

import * as vscode from 'vscode';
import { ExtensionUtil } from '../../extension/util/ExtensionUtil';
import { VSCodeBlockchainOutputAdapter } from '../../extension/logging/VSCodeBlockchainOutputAdapter';
import { TestUtil } from '../TestUtil';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { ExtensionCommands } from '../../ExtensionCommands';
import { FabricGatewayConnectionManager } from '../../extension/fabric/FabricGatewayConnectionManager';
import { FabricEnvironmentRegistry, FabricEnvironmentRegistryEntry, FabricRuntimeUtil, LogType, FabricGatewayRegistry, FabricGatewayRegistryEntry, EnvironmentFlags } from 'ibm-blockchain-platform-common';
import { FabricEnvironmentManager } from '../../extension/fabric/environments/FabricEnvironmentManager';
import { UserInputUtil, IBlockchainQuickPickItem } from '../../extension/commands/UserInputUtil';
import { EnvironmentFactory } from '../../extension/fabric/environments/EnvironmentFactory';
import { RuntimeTreeItem } from '../../extension/explorer/runtimeOps/disconnectedTree/RuntimeTreeItem';
import { BlockchainEnvironmentExplorerProvider } from '../../extension/explorer/environmentExplorer';
import { LocalMicroEnvironment } from '../../extension/fabric/environments/LocalMicroEnvironment';
chai.should();

// tslint:disable no-unused-expression
describe('stopFabricRuntime', () => {

    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    const connectionRegistry: FabricGatewayRegistry = FabricGatewayRegistry.instance();
    let getGatewayRegistryEntryStub: sinon.SinonStub;
    let getEnvironmentRegistryEntryStub: sinon.SinonStub;
    let logSpy: sinon.SinonSpy;
    let stopStub: sinon.SinonStub;
    let executeCommandSpy: sinon.SinonSpy;
    let getConnectionStub: sinon.SinonStub;
    let showFabricEnvironmentQuickPickBoxStub: sinon.SinonStub;

    let localRegistryEntry: FabricEnvironmentRegistryEntry;

    before(async () => {
        await TestUtil.setupTests(sandbox);
    });

    beforeEach(async () => {
        await ExtensionUtil.activateExtension();
        await connectionRegistry.clear();
        await TestUtil.startLocalFabric();

        const localGateway: FabricGatewayRegistryEntry = await FabricGatewayRegistry.instance().get(`${FabricRuntimeUtil.LOCAL_FABRIC} - Org1 Gateway`);

        getGatewayRegistryEntryStub = sandbox.stub(FabricGatewayConnectionManager.instance(), 'getGatewayRegistryEntry');
        getGatewayRegistryEntryStub.resolves(localGateway);

        getEnvironmentRegistryEntryStub = sandbox.stub(FabricEnvironmentManager.instance(), 'getEnvironmentRegistryEntry');
        getConnectionStub = sandbox.stub(FabricEnvironmentManager.instance(), 'getConnection');
        getConnectionStub.returns(undefined);

        const localEnvironment: FabricEnvironmentRegistryEntry = await FabricEnvironmentRegistry.instance().get(FabricRuntimeUtil.LOCAL_FABRIC);
        getEnvironmentRegistryEntryStub.returns(localEnvironment);

        logSpy = sandbox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
        executeCommandSpy = sandbox.spy(vscode.commands, 'executeCommand');

        localRegistryEntry = await FabricEnvironmentRegistry.instance().get(FabricRuntimeUtil.LOCAL_FABRIC);
        showFabricEnvironmentQuickPickBoxStub = sandbox.stub(UserInputUtil, 'showFabricEnvironmentQuickPickBox');
        showFabricEnvironmentQuickPickBoxStub.resolves({ label: FabricRuntimeUtil.LOCAL_FABRIC, data: localRegistryEntry });
    });

    afterEach(async () => {
        sandbox.restore();
        await connectionRegistry.clear();
    });

    it('should do nothing and report a warning on Eclipse Che', async () => {
        sandbox.stub(ExtensionUtil, 'isChe').returns(true);
        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC_SHORT);
        logSpy.should.have.been.calledWithExactly(LogType.ERROR, sinon.match(/not supported/));
    });

    it('should stop a Fabric environment from the tree', async () => {
        const environment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(localRegistryEntry) as LocalMicroEnvironment;
        stopStub = sandbox.stub(environment, 'stop').resolves();
        sandbox.stub(environment, 'startLogs').resolves();
        const blockchainEnvironmentExplorerProvider: BlockchainEnvironmentExplorerProvider = ExtensionUtil.getBlockchainEnvironmentExplorerProvider();
        const treeItem: RuntimeTreeItem = await RuntimeTreeItem.newRuntimeTreeItem(blockchainEnvironmentExplorerProvider,
            environment.getName(),
            localRegistryEntry,
            {
                command: ExtensionCommands.CONNECT_TO_ENVIRONMENT,
                title: '',
                arguments: [localRegistryEntry]
            },
            environment
        );

        getGatewayRegistryEntryStub.resolves();
        getEnvironmentRegistryEntryStub.returns(undefined);

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC_SHORT, treeItem);

        stopStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());

        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);

        logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
    });

    it('should stop a Fabric runtime, disconnect from gateway and refresh the view', async () => {
        const environment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(localRegistryEntry) as LocalMicroEnvironment;
        stopStub = sandbox.stub(environment, 'stop').resolves();
        sandbox.stub(environment, 'startLogs').resolves();
        const blockchainEnvironmentExplorerProvider: BlockchainEnvironmentExplorerProvider = ExtensionUtil.getBlockchainEnvironmentExplorerProvider();
        const treeItem: RuntimeTreeItem = await RuntimeTreeItem.newRuntimeTreeItem(blockchainEnvironmentExplorerProvider,
            environment.getName(),
            localRegistryEntry,
            {
                command: ExtensionCommands.CONNECT_TO_ENVIRONMENT,
                title: '',
                arguments: [localRegistryEntry]
            },
            environment
        );

        getEnvironmentRegistryEntryStub.returns(undefined);

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC_SHORT, treeItem);

        stopStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());

        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);

        logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
    });

    it('should stop a Fabric runtime, disconnect from environment and refresh the view', async () => {
        const environment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(localRegistryEntry) as LocalMicroEnvironment;
        stopStub = sandbox.stub(environment, 'stop').resolves();
        sandbox.stub(environment, 'startLogs').resolves();
        const blockchainEnvironmentExplorerProvider: BlockchainEnvironmentExplorerProvider = ExtensionUtil.getBlockchainEnvironmentExplorerProvider();
        const treeItem: RuntimeTreeItem = await RuntimeTreeItem.newRuntimeTreeItem(blockchainEnvironmentExplorerProvider,
            environment.getName(),
            localRegistryEntry,
            {
                command: ExtensionCommands.CONNECT_TO_ENVIRONMENT,
                title: '',
                arguments: [localRegistryEntry]
            },
            environment
        );

        getGatewayRegistryEntryStub.resolves();

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC_SHORT, treeItem);

        stopStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());

        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);

        logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
    });

    it('should display an error if stopping Fabric Runtime fails', async () => {
        const error: Error = new Error('what the fabric has happened');

        const environment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(localRegistryEntry) as LocalMicroEnvironment;
        stopStub = sandbox.stub(environment, 'stop').throws(error);
        sandbox.stub(environment, 'startLogs').resolves();
        const blockchainEnvironmentExplorerProvider: BlockchainEnvironmentExplorerProvider = ExtensionUtil.getBlockchainEnvironmentExplorerProvider();
        const treeItem: RuntimeTreeItem = await RuntimeTreeItem.newRuntimeTreeItem(blockchainEnvironmentExplorerProvider,
            environment.getName(),
            localRegistryEntry,
            {
                command: ExtensionCommands.CONNECT_TO_ENVIRONMENT,
                title: '',
                arguments: [localRegistryEntry]
            },
            environment
        );

        getGatewayRegistryEntryStub.resolves();
        getEnvironmentRegistryEntryStub.returns(undefined);

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC_SHORT, treeItem);

        stopStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());

        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);

        logSpy.getCall(0).should.have.been.calledWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
        logSpy.getCall(1).should.have.been.calledWithExactly(LogType.ERROR, `Failed to stop ${environment.getName()}: ${error.message}`, `Failed to stop ${environment.getName()}: ${error.toString()}`);
    });

    it('should be able to stop the an environment from the command', async () => {
        showFabricEnvironmentQuickPickBoxStub.resolves({ label: FabricRuntimeUtil.LOCAL_FABRIC, data: localRegistryEntry } as IBlockchainQuickPickItem<FabricEnvironmentRegistryEntry>);
        const environment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(localRegistryEntry) as LocalMicroEnvironment;
        stopStub = sandbox.stub(environment, 'stop').resolves();
        sandbox.stub(environment, 'startLogs').resolves();
        getGatewayRegistryEntryStub.resolves();
        getEnvironmentRegistryEntryStub.returns(undefined);

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC);

        showFabricEnvironmentQuickPickBoxStub.should.have.been.calledOnceWithExactly('Select an environment to stop', false, true, [EnvironmentFlags.LOCAL], [], true);

        stopStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());

        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);

        logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
    });

    it('should stop local connected environment (called from three dot menu)', async () => {
        getConnectionStub.returns({});
        const environment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(localRegistryEntry) as LocalMicroEnvironment;
        stopStub = sandbox.stub(environment, 'stop').resolves();

        getGatewayRegistryEntryStub.resolves();

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC);

        showFabricEnvironmentQuickPickBoxStub.should.not.have.been.called;
        stopStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());

        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);

        logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
    });

    it('should ask what environment to stop if connected to non-managed environment', async () => {
        getEnvironmentRegistryEntryStub.returns({name: 'otherEnvironment'} as FabricEnvironmentRegistryEntry);

        const environment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(localRegistryEntry) as LocalMicroEnvironment;
        stopStub = sandbox.stub(environment, 'stop').resolves();

        getGatewayRegistryEntryStub.resolves();
        showFabricEnvironmentQuickPickBoxStub.resolves({label: FabricRuntimeUtil.LOCAL_FABRIC, data: localRegistryEntry} as IBlockchainQuickPickItem<FabricEnvironmentRegistryEntry>);

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC);

        showFabricEnvironmentQuickPickBoxStub.should.have.been.calledOnceWithExactly('Select an environment to stop', false, true, [EnvironmentFlags.LOCAL], [], true);
        stopStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());

        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);

        logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
    });

    it('should be able to cancel choosing an environment to stop', async () => {
        showFabricEnvironmentQuickPickBoxStub.resolves(undefined);

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC);

        showFabricEnvironmentQuickPickBoxStub.should.have.been.calledOnceWithExactly('Select an environment to stop', false, true, [EnvironmentFlags.LOCAL], [], true);

        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);

        logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
    });

    it(`shouldn't disconnect from the connected gateway if the environment isn't associated`, async () => {

        showFabricEnvironmentQuickPickBoxStub.resolves({ label: FabricRuntimeUtil.LOCAL_FABRIC, data: localRegistryEntry });

        stopStub = sandbox.stub(LocalMicroEnvironment.prototype, 'stop').resolves();

        getEnvironmentRegistryEntryStub.returns(undefined);

        const localEnv: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(localRegistryEntry) as LocalMicroEnvironment;
        sandbox.stub(EnvironmentFactory, 'getEnvironment').returns(localEnv);

        getGatewayRegistryEntryStub.resolves({
            name: 'SomeGateway',
            fromEnvironment: 'SomeEnvironment'
        } as FabricGatewayRegistryEntry);

        await vscode.commands.executeCommand(ExtensionCommands.STOP_FABRIC);

        showFabricEnvironmentQuickPickBoxStub.should.have.been.calledOnceWithExactly('Select an environment to stop', false, true, [EnvironmentFlags.LOCAL], [], true);

        stopStub.should.have.been.called.calledOnceWithExactly(VSCodeBlockchainOutputAdapter.instance());

        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_GATEWAY);
        executeCommandSpy.should.not.have.been.calledWith(ExtensionCommands.DISCONNECT_ENVIRONMENT);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_ENVIRONMENTS);
        executeCommandSpy.should.have.been.calledWith(ExtensionCommands.REFRESH_GATEWAYS);

        logSpy.should.have.been.calledOnceWithExactly(LogType.INFO, undefined, 'stopFabricRuntime');
    });
});
